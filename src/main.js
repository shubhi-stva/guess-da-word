import { loadWords, pickAnswer, MIN_LENGTH, MAX_LENGTH } from './words.js';
import { score, hardModeViolation, bestMark, shareGrid, CORRECT } from './scoring.js';
import { getStats, recordResult, resetStats, getPref, setPref } from './stats.js';

const $ = (id) => document.getElementById(id);

const el = {
  board: $('board'),
  keyboard: $('keyboard'),
  toastArea: $('toast-area'),
  lengthSelect: $('length-select'),
  hardMode: $('hard-mode'),
  newGame: $('new-game-btn'),
  backdrop: $('modal-backdrop'),
  helpModal: $('help-modal'),
  statsModal: $('stats-modal'),
  statsRow: $('stats-row'),
  statsScope: $('stats-scope-label'),
  dist: $('dist'),
};

const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const RECENT_MAX = 40;

/** Everything about the round in progress. */
let game = null;
const recentByLength = new Map();
let busy = false; // true while tiles are flipping, so input is ignored

/* ---------------------------------------------------------------- board */

function buildBoard(length, rows) {
  el.board.replaceChildren();
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let c = 0; c < length; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'gridcell');
      row.append(tile);
    }
    el.board.append(row);
  }
  sizeBoard();
}

/**
 * The grid grows with word length and shrinks with viewport, so tile size is
 * derived from whichever of width/height runs out first.
 */
function sizeBoard() {
  if (!game) return;
  const { length, rows } = game;
  const gap = 5;
  const wrap = el.board.parentElement;
  const availW = wrap.clientWidth - gap * (length - 1);
  const availH = wrap.clientHeight - gap * (rows - 1) - 8;
  const size = Math.max(24, Math.floor(Math.min(availW / length, availH / rows, 62)));
  el.board.style.setProperty('--tile', `${size}px`);
}

const rowAt = (i) => el.board.children[i];
const tileAt = (r, c) => rowAt(r).children[c];

/* ------------------------------------------------------------- keyboard */

function buildKeyboard() {
  el.keyboard.replaceChildren();
  KB_ROWS.forEach((letters, i) => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    if (i === 2) row.append(key('Enter', 'enter', true));
    else if (i === 1) row.append(spacer());
    for (const ch of letters) row.append(key(ch.toUpperCase(), ch));
    if (i === 2) row.append(key('⌫', 'backspace', true));
    else if (i === 1) row.append(spacer());
    el.keyboard.append(row);
  });
}

function key(label, value, wide = false) {
  const b = document.createElement('button');
  b.className = wide ? 'key wide' : 'key';
  b.textContent = label;
  b.dataset.key = value;
  b.type = 'button';
  b.setAttribute('aria-label', value === 'backspace' ? 'Backspace' : label);
  return b;
}

function spacer() {
  const s = document.createElement('div');
  s.className = 'spacer';
  return s;
}

function paintKeyboard() {
  for (const b of el.keyboard.querySelectorAll('.key')) {
    const mark = game.keyMarks[b.dataset.key];
    b.classList.remove('correct', 'present', 'absent');
    if (mark) b.classList.add(mark);
  }
}

/* ---------------------------------------------------------------- rounds */

async function newRound({ length = game?.length ?? 5, keepKeyboard = false } = {}) {
  dismissToasts();
  busy = true;

  const rows = length + 1;
  game = { length, rows, answer: null, row: 0, current: '', history: [], keyMarks: {}, over: false };
  buildBoard(length, rows);
  if (!keepKeyboard) paintKeyboard();

  let words;
  try {
    words = await loadWords(length);
  } catch (err) {
    busy = false;
    toast(
      location.protocol === 'file:'
        ? 'Word lists need a web server — see the README'
        : err.message,
      { sticky: true },
    );
    return;
  }

  // Guard against a length change while the fetch was in flight.
  if (!game || game.length !== length) return;

  const recent = recentByLength.get(length) || [];
  game.answer = pickAnswer(words.answers, recent);
  game.valid = words.valid;
  recent.push(game.answer);
  if (recent.length > RECENT_MAX) recent.shift();
  recentByLength.set(length, recent);

  game.keyMarks = {};
  paintKeyboard();
  busy = false;
}

/* ----------------------------------------------------------------- input */

function typeLetter(ch) {
  if (game.current.length >= game.length) return;
  game.current += ch;
  const tile = tileAt(game.row, game.current.length - 1);
  tile.textContent = ch;
  tile.classList.add('filled');
}

function backspace() {
  if (!game.current.length) return;
  const tile = tileAt(game.row, game.current.length - 1);
  tile.textContent = '';
  tile.classList.remove('filled');
  game.current = game.current.slice(0, -1);
}

async function submit() {
  const guess = game.current;

  if (guess.length < game.length) return reject(`Not enough letters`);
  if (!game.valid.has(guess)) return reject('Not in word list');

  if (el.hardMode.checked) {
    const problem = hardModeViolation(guess, game.history);
    if (problem) return reject(problem);
  }

  const marks = score(guess, game.answer);
  game.history.push({ word: guess, marks });
  for (let i = 0; i < marks.length; i++) {
    game.keyMarks[guess[i]] = bestMark(game.keyMarks[guess[i]], marks[i]);
  }

  await reveal(game.row, marks);
  paintKeyboard();

  const won = marks.every((m) => m === CORRECT);
  const lost = !won && game.row + 1 >= game.rows;

  if (won || lost) return finish(won);

  game.row += 1;
  game.current = '';
}

function reject(message) {
  toast(message);
  const row = rowAt(game.row);
  row.classList.remove('shake');
  void row.offsetWidth; // restart the animation
  row.classList.add('shake');
}

function reveal(rowIndex, marks) {
  busy = true;
  const row = rowAt(rowIndex);
  return new Promise((resolve) => {
    marks.forEach((mark, i) => {
      const tile = row.children[i];
      setTimeout(() => {
        tile.classList.add('reveal');
        setTimeout(() => {
          tile.classList.remove('filled');
          tile.classList.add(mark);
        }, 250);
      }, i * 250);
    });
    setTimeout(() => { busy = false; resolve(); }, marks.length * 250 + 300);
  });
}

function finish(won) {
  game.over = true;
  const stats = recordResult(game.length, { won, guesses: game.history.length });

  if (won) {
    rowAt(game.row).classList.add('win');
    const praise = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
    const i = Math.min(game.history.length - 1, praise.length - 1);
    endToast(`${praise[i]}! Streak ${stats.streak}`, won);
  } else {
    endToast(`The word was ${game.answer.toUpperCase()}`, won);
  }
}

/* ---------------------------------------------------------------- toasts */

function toast(message, { sticky = false } = {}) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  el.toastArea.append(node);
  if (sticky) return node;
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 300);
  }, 1100);
  return node;
}

function endToast(message, won) {
  const node = toast(message, { sticky: true });
  node.style.pointerEvents = 'auto';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:10px';

  const share = document.createElement('button');
  share.className = 'btn';
  share.textContent = 'Share';
  share.addEventListener('click', () => shareResult(won).then((ok) => {
    share.textContent = ok ? 'Copied!' : 'Copy failed';
  }));

  const next = document.createElement('button');
  next.className = 'btn';
  next.textContent = 'Next word';
  next.addEventListener('click', () => newRound());

  actions.append(share, next);
  node.append(actions);
}

function dismissToasts() {
  el.toastArea.replaceChildren();
}

async function shareResult(won) {
  const tries = won ? game.history.length : 'X';
  const text = `Endless Words — ${game.length} letters ${tries}/${game.rows}\n\n${shareGrid(game.history)}`;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- modals */

function openModal(modal) {
  el.backdrop.hidden = false;
  modal.hidden = false;
}

function closeModals() {
  el.backdrop.hidden = true;
  el.helpModal.hidden = true;
  el.statsModal.hidden = true;
}

function renderStats() {
  const length = game.length;
  const s = getStats(length);
  el.statsScope.textContent = `${length} letters`;

  const winRate = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  const cells = [
    [s.played, 'Played'],
    [winRate, 'Win %'],
    [s.streak, 'Current<br>streak'],
    [s.maxStreak, 'Max<br>streak'],
  ];
  el.statsRow.replaceChildren(...cells.map(([num, label]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<div class="num">${num}</div><div class="label">${label}</div>`;
    return d;
  }));

  const max = Math.max(1, ...s.dist);
  el.dist.replaceChildren(...s.dist.map((count, i) => {
    const row = document.createElement('div');
    row.className = 'dist-row';
    if (game.over && game.history.length === i + 1) row.classList.add('current');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = `${Math.max(7, (count / max) * 100)}%`;
    bar.textContent = count;
    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = i + 1;
    row.append(n, bar);
    return row;
  }));
}

/* ------------------------------------------------------------------ wiring */

document.addEventListener('keydown', (e) => {
  if (!el.statsModal.hidden || !el.helpModal.hidden) {
    if (e.key === 'Escape') closeModals();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (busy || !game?.answer) return;

  if (e.key === 'Enter') {
    if (game.over) newRound();
    else submit();
  } else if (e.key === 'Backspace') {
    if (!game.over) backspace();
  } else if (/^[a-zA-Z]$/.test(e.key)) {
    if (!game.over) typeLetter(e.key.toLowerCase());
  } else {
    return;
  }
  e.preventDefault();
});

el.keyboard.addEventListener('click', (e) => {
  const btn = e.target.closest('.key');
  if (!btn || busy || !game?.answer) return;
  const k = btn.dataset.key;
  if (k === 'enter') {
    if (game.over) newRound();
    else submit();
  } else if (game.over) {
    return;
  } else if (k === 'backspace') {
    backspace();
  } else {
    typeLetter(k);
  }
});

el.newGame.addEventListener('click', () => newRound());

el.lengthSelect.addEventListener('change', () => {
  const length = Number(el.lengthSelect.value);
  setPref('length', length);
  newRound({ length });
});

el.hardMode.addEventListener('change', () => {
  // Switching on mid-round would retroactively invalidate earlier guesses.
  if (el.hardMode.checked && game.history.length && !game.over) {
    el.hardMode.checked = false;
    toast('Hard mode must be set before the first guess');
    return;
  }
  setPref('hardMode', el.hardMode.checked);
});

$('help-btn').addEventListener('click', () => openModal(el.helpModal));
$('stats-btn').addEventListener('click', () => { renderStats(); openModal(el.statsModal); });
$('theme-btn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  applyTheme(dark);
  setPref('dark', dark);
});
$('reset-stats-btn').addEventListener('click', () => {
  resetStats(game.length);
  renderStats();
});

el.backdrop.addEventListener('click', closeModals);
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closeModals);

window.addEventListener('resize', sizeBoard);

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#121213' : '#ffffff';
}

/* -------------------------------------------------------------------- boot */

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(getPref('dark', prefersDark));

const savedLength = Number(getPref('length', 5));
const startLength = savedLength >= MIN_LENGTH && savedLength <= MAX_LENGTH ? savedLength : 5;
el.lengthSelect.value = String(startLength);
el.hardMode.checked = Boolean(getPref('hardMode', false));

buildKeyboard();
newRound({ length: startLength });
if (!getPref('seenHelp', false)) {
  openModal(el.helpModal);
  setPref('seenHelp', true);
}
