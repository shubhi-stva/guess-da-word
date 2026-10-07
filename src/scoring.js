/**
 * Pure game rules. No DOM, no storage, so this is the part worth unit-testing.
 */

export const CORRECT = 'correct';
export const PRESENT = 'present';
export const ABSENT = 'absent';

/**
 * Wordle's two-pass scoring: exact matches are claimed first, then the
 * remaining letters are matched against what is left of the answer, so a
 * duplicate letter is only ever marked `present` as many times as it actually
 * occurs. Returns one mark per position in `guess`.
 */
export function score(guess, answer) {
  const marks = new Array(guess.length).fill(ABSENT);
  const pool = new Map();

  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = CORRECT;
    else pool.set(answer[i], (pool.get(answer[i]) || 0) + 1);
  }

  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === CORRECT) continue;
    const left = pool.get(guess[i]) || 0;
    if (left > 0) {
      marks[i] = PRESENT;
      pool.set(guess[i], left - 1);
    }
  }

  return marks;
}

/**
 * Hard mode: every revealed hint must be reused. Returns null if `guess` is
 * allowed, otherwise a player-facing reason.
 *
 * `history` is a list of { word, marks } for guesses already played.
 */
export function hardModeViolation(guess, history) {
  const ordinal = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

  for (const { word, marks } of history) {
    // Greens must stay put.
    for (let i = 0; i < marks.length; i++) {
      if (marks[i] === CORRECT && guess[i] !== word[i]) {
        return `${ordinal[i]} letter must be ${word[i].toUpperCase()}`;
      }
    }

    // Yellows must reappear somewhere, counted so duplicates are respected.
    const required = new Map();
    for (let i = 0; i < marks.length; i++) {
      if (marks[i] === PRESENT) required.set(word[i], (required.get(word[i]) || 0) + 1);
    }
    for (const [letter, need] of required) {
      let have = 0;
      for (const ch of guess) if (ch === letter) have++;
      if (have < need) {
        return need > 1
          ? `Guess must contain ${need} ${letter.toUpperCase()}s`
          : `Guess must contain ${letter.toUpperCase()}`;
      }
    }
  }

  return null;
}

/** Best mark wins when a letter shows up more than once on the keyboard. */
const RANK = { [ABSENT]: 0, [PRESENT]: 1, [CORRECT]: 2 };

export function bestMark(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RANK[b] > RANK[a] ? b : a;
}

/** Emoji grid for sharing, same idea as Wordle's clipboard output. */
export function shareGrid(history) {
  const glyph = { [CORRECT]: '\u{1F7E9}', [PRESENT]: '\u{1F7E8}', [ABSENT]: '⬜' };
  return history.map(({ marks }) => marks.map((m) => glyph[m]).join('')).join('\n');
}
