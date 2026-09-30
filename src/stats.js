/**
 * Per-word-length stats in localStorage. Every accessor tolerates storage being
 * unavailable (private windows, blocked site data) by falling back to memory,
 * so the game never breaks over a stats write.
 */

const KEY = 'guess-da-word/v1';
let memory = null;

function read() {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    memory = {};
  }
  return memory;
}

function write(data) {
  memory = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* keep going with the in-memory copy */
  }
}

function blank(length) {
  return {
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    // index 0 === solved in one guess; a length-N word allows N+1 guesses
    dist: new Array(length + 1).fill(0),
  };
}

export function getStats(length) {
  const all = read();
  const s = all[`len${length}`];
  if (!s) return blank(length);
  const dist = new Array(length + 1).fill(0);
  (s.dist || []).forEach((v, i) => { if (i < dist.length) dist[i] = v; });
  return { ...blank(length), ...s, dist };
}

export function recordResult(length, { won, guesses }) {
  const all = read();
  const s = getStats(length);
  s.played += 1;
  if (won) {
    s.wins += 1;
    s.streak += 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.dist[guesses - 1] += 1;
  } else {
    s.streak = 0;
  }
  all[`len${length}`] = s;
  write(all);
  return s;
}

export function resetStats(length) {
  const all = read();
  delete all[`len${length}`];
  write(all);
  return blank(length);
}

/* --- small preferences, same storage, same tolerance --- */

export function getPref(name, fallback) {
  const all = read();
  const prefs = all.prefs || {};
  return name in prefs ? prefs[name] : fallback;
}

export function setPref(name, value) {
  const all = read();
  all.prefs = { ...(all.prefs || {}), [name]: value };
  write(all);
}
