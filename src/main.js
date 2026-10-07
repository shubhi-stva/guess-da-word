import { loadWords, pickAnswer, MIN_LENGTH, MAX_LENGTH } from './words.js';
import { score, hardModeViolation, bestMark, shareGrid, CORRECT } from './scoring.js';
import { getStats, recordResult, resetStats, getPref, setPref } from './stats.js';
import { createTipCycle } from './tips.js';
import { createCountdown, formatClock } from './timer.js';

const $ = (id) => document.getElementById(id);

const el = {
  board: $('board'),
  keyboard: $('keyboard'),
  toastArea: $('toast-area'),
  lengthGroup: $('length-group'),
  hardMode: $('hard-mode'),
  themeToggle: $('theme-toggle'),
  newGame: $('new-game-btn'),
  backdrop: $('modal-backdrop'),
  helpModal: $('help-modal'),
  statsModal: $('stats-modal'),
  settingsModal: $('settings-modal'),
  helpTries: $('help-tries'),
  header: document.querySelector('.header'),
  splash: $('splash'),
  tip: $('tip'),
  tipText: $('tip-text'),
  tipsToggle: $('tips-toggle'),
  timer: $('timer'),
  timerValue: $('timer-value'),
  timerToggle: $('timer-toggle'),
  statsRow: $('stats-row'),
  statsScope: $('stats-scope-label'),
  shareBtn: $('share-btn'),
  dist: $('dist'),
};

const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const TIP_CHANCE = 0.45;      // roughly how often a round opens with a tip
const TIP_MIN_GAP = 2;        // and never closer together than this many rounds
const TIP_DURATION = 9000;
const ROUND_MS = 120000;      // two minutes per round
const CLOCK_TICK = 200;
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3H7c-.7 0-1.2.4-1.6.9L0 12l5.4 8.1c.4.5 1 .9 1.6.9h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.6L17.6 17 14 13.4 10.4 17 9 15.6l3.6-3.6L9 8.4 10.4 7 14 10.6 17.6 7 19 8.4 15.4 12 19 15.6z"/></svg>';
const RECENT_MAX = 40;

/** Everything about the round in progress. */
let game = null;
const recentByLength = new Map();
let busy = false; // true while tiles are flipping, so input is ignored
let roundCount = 0;
let lastTipRound = 0;
let tipTimer = null;
const nextTip = createTipCycle();
const countdown = createCountdown(ROUND_MS);
let clockTimer = null;

/* ---------------------------------------------------------------- board */

function buildBoard(length, rows) {
  el.board.replaceChildren();
  el.board.style.setProperty('--cols', length);
  el.board.style.setProperty('--rows', rows);

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
    if (i === 2) row.append(key(BACKSPACE_ICON, 'backspace', true, true));
    else if (i === 1) row.append(spacer());
    el.keyboard.append(row);
  });
}

function key(label, value, wide = false, isIcon = false) {
  const b = document.createElement('button');
  b.className = wide ? 'key wide' : 'key';
  if (isIcon) b.innerHTML = label;
  else b.textContent = label;
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

  roundCount += 1;
  maybeShowTip();
  startClock();
}

/* ----------------------------------------------------------------- clock */

function timerEnabled() {
  return isOn(el.timerToggle);
}

function startClock() {
  stopClock();
  el.timer.hidden = !timerEnabled();
  if (!timerEnabled()) return;

  countdown.start();
  // a dialog open at the start of a round should not burn the clock
  if (anyDialogOpen()) countdown.pause();
  renderClock();
  clockTimer = setInterval(onClockTick, CLOCK_TICK);
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
  countdown.stop();
}

function onClockTick() {
  renderClock();
  if (!countdown.expired()) return;
  // let an in-flight reveal finish before ending the round on it
  if (busy) return;
  stopClock();
  if (!game.over) finish(false, { timedOut: true });
}

function renderClock() {
  const left = countdown.remaining();
  el.timerValue.textContent = formatClock(left);
  el.timer.classList.toggle('warning', left <= 30000 && left > 10000);
  el.timer.classList.toggle('danger', left <= 10000);
  el.timer.classList.toggle('paused', countdown.paused);
}

/** The clock stops while any dialog covers the board. */
function anyDialogOpen() {
  return !el.splash.hidden || !el.statsModal.hidden || !el.helpModal.hidden || !el.settingsModal.hidden;
}

function syncClockWithDialogs() {
  if (!timerEnabled() || !clockTimer) return;
  if (anyDialogOpen()) countdown.pause();
  else countdown.resume();
  renderClock();
}

/* ------------------------------------------------------------------ tips */

/**
 * Tips appear between rounds, never mid-guess, and only once the player has a
 * round behind them. They are drawn from a fixed list that knows nothing about
 * the answer, so one can never amount to a hint.
 */
function maybeShowTip() {
  if (!isOn(el.tipsToggle)) return;
  if (roundCount < 2) return;                          // let the first round play out
  if (roundCount - lastTipRound < TIP_MIN_GAP) return;
  if (!el.splash.hidden || !el.statsModal.hidden || !el.helpModal.hidden || !el.settingsModal.hidden) return;
  if (Math.random() > TIP_CHANCE) return;

  lastTipRound = roundCount;
  showTip(nextTip());
}

function showTip(text) {
  clearTimeout(tipTimer);
  el.tipText.textContent = text;
  el.tip.hidden = false;
  // restart the entrance animation if a tip is already on screen
  el.tip.classList.remove('in');
  void el.tip.offsetWidth;
  el.tip.classList.add('in');

  // Give the card its own space instead of letting it cover the bottom row:
  // the board resizes to fit, and the tiles ease into their new size.
  tipTimer = setTimeout(hideTip, TIP_DURATION);
}

function hideTip() {
  clearTimeout(tipTimer);
  if (el.tip.hidden) return;
  el.tip.classList.remove('in');
  el.tip.classList.add('out');
  setTimeout(() => {
    el.tip.hidden = true;
    el.tip.classList.remove('out');
  }, 220);
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
  hideTip();

  if (guess.length < game.length) return reject(`Not enough letters`);
  if (!game.valid.has(guess)) return reject('Not in word list');

  if (isOn(el.hardMode)) {
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

/**
 * Flips a row one tile at a time. The stagger shrinks as words get longer so a
 * nine-letter reveal still lands in about a second instead of dragging on, and
 * each tile recolours at the midpoint of its own flip, when it is edge-on.
 */
function reveal(rowIndex, marks) {
  busy = true;
  const row = rowAt(rowIndex);
  const stagger = Math.max(95, Math.min(180, 900 / marks.length));
  const flip = 420;

  return new Promise((resolve) => {
    marks.forEach((mark, i) => {
      const tile = row.children[i];
      tile.style.setProperty('--flip', `${flip}ms`);
      setTimeout(() => {
        tile.classList.add('reveal');
        setTimeout(() => {
          tile.classList.remove('filled');
          tile.classList.add(mark);
        }, flip / 2);
      }, i * stagger);
    });
    setTimeout(() => { busy = false; resolve(); }, (marks.length - 1) * stagger + flip + 60);
  });
}

/** Wordle's victory bounce, rippling left to right rather than all at once. */
function celebrate(rowIndex) {
  const row = rowAt(rowIndex);
  [...row.children].forEach((tile, i) => {
    tile.style.setProperty('--bounce-delay', `${i * 85}ms`);
  });
  row.classList.add('win');
}

function finish(won, { timedOut = false } = {}) {
  game.over = true;
  stopClock();
  hideTip();
  const stats = recordResult(game.length, { won, guesses: game.history.length });

  if (won) {
    celebrate(game.row);
    const praise = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
    toast(praise[Math.min(game.history.length - 1, praise.length - 1)]);
  } else {
    toast(timedOut ? `Time! The word was ${game.answer.toUpperCase()}` : game.answer.toUpperCase());
  }

  // Wordle shows the result in the stats panel rather than leaving a toast
  // sitting over the board; wait for the flip and bounce to play out first.
  setTimeout(() => {
    if (game.over) { renderStats(stats); openModal(el.statsModal); }
  }, won ? 1800 : 1400);
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

function dismissToasts() {
  el.toastArea.replaceChildren();
}

async function shareResult() {
  const won = game.history.length && game.history.at(-1).marks.every((m) => m === CORRECT);
  const tries = won ? game.history.length : 'X';
  const text = `Guess Da Word — ${game.length} letters ${tries}/${game.rows}\n\n${shareGrid(game.history)}`;
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
  syncClockWithDialogs();
}

function closeModals() {
  el.backdrop.hidden = true;
  el.helpModal.hidden = true;
  el.statsModal.hidden = true;
  el.settingsModal.hidden = true;
  syncClockWithDialogs();
}

function closeSplash() {
  el.splash.hidden = true;
  setPref('seenSplash', true);
  syncClockWithDialogs();
}

/* Switches are <button role="switch">, so state lives in aria-checked. */
const isOn = (sw) => sw.getAttribute('aria-checked') === 'true';

function setSwitch(sw, on) {
  sw.setAttribute('aria-checked', String(Boolean(on)));
}

/** The length picker is a segmented radiogroup built from MIN/MAX_LENGTH. */
function buildLengthGroup(selected) {
  el.lengthGroup.replaceChildren();
  for (let n = MIN_LENGTH; n <= MAX_LENGTH; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n;
    b.dataset.length = n;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(n === selected));
    b.setAttribute('aria-label', `${n} letters`);
    el.lengthGroup.append(b);
  }
}

function markLength(length) {
  for (const b of el.lengthGroup.children) {
    b.setAttribute('aria-checked', String(Number(b.dataset.length) === length));
  }
  el.helpTries.textContent = length + 1;
}

function renderStats(fresh) {
  const length = game.length;
  const s = fresh || getStats(length);
  el.shareBtn.hidden = !game.over;
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
  if (!el.splash.hidden) {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      closeSplash();
      e.preventDefault();
    }
    return;
  }
  if (!el.statsModal.hidden || !el.helpModal.hidden || !el.settingsModal.hidden) {
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

el.lengthGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-length]');
  if (!btn) return;
  const length = Number(btn.dataset.length);
  if (length === game.length) return;
  markLength(length);
  setPref('length', length);
  newRound({ length });
});

el.hardMode.addEventListener('click', () => {
  // Switching on mid-round would retroactively invalidate earlier guesses.
  if (!isOn(el.hardMode) && game.history.length && !game.over) {
    toast('Hard mode can only be turned on at the start of a round');
    return;
  }
  setSwitch(el.hardMode, !isOn(el.hardMode));
  setPref('hardMode', isOn(el.hardMode));
});

el.themeToggle.addEventListener('click', () => {
  const dark = !isOn(el.themeToggle);
  setSwitch(el.themeToggle, dark);
  applyTheme(dark);
  setPref('dark', dark);
});

el.timerToggle.addEventListener('click', () => {
  setSwitch(el.timerToggle, !timerEnabled());
  setPref('timer', timerEnabled());
  if (!timerEnabled()) {
    stopClock();
    el.timer.hidden = true;
  } else if (!game.over) {
    startClock();   // the current round gets a full two minutes
  }
});

$('tip-close').addEventListener('click', hideTip);

el.tipsToggle.addEventListener('click', () => {
  setSwitch(el.tipsToggle, !isOn(el.tipsToggle));
  setPref('tips', isOn(el.tipsToggle));
  if (!isOn(el.tipsToggle)) hideTip();
});

$('splash-play').addEventListener('click', closeSplash);
$('splash-help').addEventListener('click', () => { closeSplash(); openModal(el.helpModal); });

$('help-btn').addEventListener('click', () => openModal(el.helpModal));
$('settings-btn').addEventListener('click', () => openModal(el.settingsModal));
$('stats-btn').addEventListener('click', () => { renderStats(); openModal(el.statsModal); });
$('reset-stats-btn').addEventListener('click', () => {
  resetStats(game.length);
  renderStats();
});
$('stats-next-btn').addEventListener('click', () => { closeModals(); newRound(); });
el.shareBtn.addEventListener('click', async () => {
  const ok = await shareResult();
  el.shareBtn.textContent = ok ? 'Copied!' : 'Copy failed';
  setTimeout(() => { el.shareBtn.textContent = 'Share'; }, 1600);
});

el.backdrop.addEventListener('click', closeModals);
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closeModals);



function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#121213' : '#ffffff';
}

/* -------------------------------------------------------------------- boot */

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(getPref('dark', prefersDark));

const savedLength = Number(getPref('length', 5));
const startLength = savedLength >= MIN_LENGTH && savedLength <= MAX_LENGTH ? savedLength : 5;
buildLengthGroup(startLength);
markLength(startLength);
setSwitch(el.hardMode, getPref('hardMode', false));
setSwitch(el.tipsToggle, getPref('tips', true));
setSwitch(el.timerToggle, getPref('timer', true));
setSwitch(el.themeToggle, document.documentElement.dataset.theme === 'dark');

buildKeyboard();
newRound({ length: startLength });

if (!getPref('seenSplash', false)) el.splash.hidden = false;
