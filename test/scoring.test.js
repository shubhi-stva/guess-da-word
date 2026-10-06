import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { score, hardModeViolation, shareGrid, CORRECT, PRESENT, ABSENT } from '../src/scoring.js';
import { TIPS, createTipCycle } from '../src/tips.js';

const marks = (guess, answer) =>
  score(guess, answer).map((m) => ({ [CORRECT]: 'G', [PRESENT]: 'Y', [ABSENT]: '.' })[m]).join('');

test('all-correct guess', () => {
  assert.equal(marks('crane', 'crane'), 'GGGGG');
});

test('misplaced letters are yellow', () => {
  assert.equal(marks('crane', 'nacre'), 'YYYYG');
});

test('duplicate in guess is only credited as often as it occurs in the answer', () => {
  // one L in "solar", so the second L in "llama" gets nothing
  assert.equal(marks('llama', 'solar'), 'Y.Y..');
});

test('greens are claimed before yellows', () => {
  // both Es of "geese" cannot be yellow when one is already green
  assert.equal(marks('geese', 'these'), '..GGG');
});

test('duplicate in answer, single in guess', () => {
  assert.equal(marks('event', 'geese'), 'Y.G..');
});

test('no shared letters', () => {
  assert.equal(marks('blimp', 'notes'), '.....');
});

test('hard mode allows a fresh guess when nothing is revealed', () => {
  assert.equal(hardModeViolation('crane', []), null);
});

test('hard mode pins green letters to their position', () => {
  const history = [{ word: 'crane', marks: score('crane', 'crate') }];
  assert.match(hardModeViolation('slate', history), /1st letter must be C/);
  assert.equal(hardModeViolation('crate', history), null);
});

test('hard mode requires yellow letters to be reused', () => {
  // crane vs nacre: E is green, C/R/A/N are all yellow
  const history = [{ word: 'crane', marks: score('crane', 'nacre') }];
  assert.match(hardModeViolation('those', history), /must contain C/);
  assert.equal(hardModeViolation('nacre', history), null);
});

test('hard mode counts repeated yellows', () => {
  const history = [{ word: 'aback', marks: [PRESENT, ABSENT, PRESENT, ABSENT, ABSENT] }];
  assert.equal(hardModeViolation('salad', history), null, 'two As satisfy two yellow As');
  assert.match(hardModeViolation('about', history), /2 As/);
});

test('share grid renders one glyph per tile', () => {
  const history = [{ word: 'crane', marks: score('crane', 'crate') }];
  assert.equal(shareGrid(history), '\u{1F7E9}\u{1F7E9}\u{1F7E9}⬜\u{1F7E9}');
});

/* --- the word lists the game ships with --- */

const read = (f) => readFileSync(new URL(`../words/${f}`, import.meta.url), 'utf8').split('\n').filter(Boolean);
const lengths = [...new Set(readdirSync(new URL('../words', import.meta.url))
  .map((f) => f.match(/^answers-(\d+)\.txt$/)?.[1])
  .filter(Boolean))].map(Number);

test('answer and dictionary lists exist for lengths 4-9', () => {
  assert.deepEqual(lengths.sort((a, b) => a - b), [4, 5, 6, 7, 8, 9]);
});

for (const n of lengths) {
  test(`${n}-letter lists are well formed`, () => {
    const answers = read(`answers-${n}.txt`);
    const dict = new Set(read(`dict-${n}.txt`));
    assert.ok(answers.length > 500, `only ${answers.length} answers`);
    for (const w of answers) {
      assert.equal(w.length, n, `"${w}" is not ${n} letters`);
      assert.match(w, /^[a-z]+$/, `"${w}" has non-letters`);
      assert.ok(dict.has(w), `answer "${w}" is not a legal guess`);
    }
  });
}

test('the guess list accepts modern words and well-known slang', () => {
  // Older dictionaries predate all of these; they used to be rejected.
  const expected = [
    'emails', 'selfie', 'selfies', 'memes', 'texted', 'blogs', 'googled',
    'podcast', 'blogger', 'tweeted', 'emoji', 'wifi', 'screenshot',
    'yeet', 'bruh', 'lowkey', 'stoked', 'hangry', 'snazzy', 'adulting',
  ];
  const lists = Object.fromEntries(lengths.map((n) => [n, new Set(read(`dict-${n}.txt`))]));
  const rejected = expected.filter((w) => w.length <= 9 && !lists[w.length]?.has(w));
  assert.deepEqual(rejected, [], `these should be legal guesses: ${rejected}`);
});

test('the guess list covers the bulk of the English dictionary', () => {
  // A whole-dictionary list is ~16k five-letter words; the old Webster's-only
  // list had half that, which rejected too many real guesses.
  assert.ok(read('dict-5.txt').length > 15000, 'five-letter guess list looks truncated');
  assert.ok(read('dict-8.txt').length > 45000, 'eight-letter guess list looks truncated');
});

/* --- strategy tips --- */

test('every tip is shown once before any repeats', () => {
  const next = createTipCycle();
  const first = new Set();
  for (let i = 0; i < TIPS.length; i++) first.add(next());
  assert.equal(first.size, TIPS.length, 'a tip repeated within the first pass');
});

test('a tip never immediately follows itself across cycles', () => {
  const next = createTipCycle();
  let previous = null;
  for (let i = 0; i < TIPS.length * 5; i++) {
    const tip = next();
    assert.notEqual(tip, previous, 'the same tip appeared twice in a row');
    previous = tip;
  }
});

test('tips give strategy advice without referencing the current round', () => {
  // A tip must never read as a hint about the word in play.
  const forbidden = /\byour (guess|word|answer)\b|\bthis word\b|\bthe answer is\b/i;
  for (const tip of TIPS) {
    assert.ok(!forbidden.test(tip), `tip looks round-specific: "${tip}"`);
    assert.ok(tip.length > 20, `tip is too terse: "${tip}"`);
  }
});
