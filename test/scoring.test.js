import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { score, hardModeViolation, shareGrid, CORRECT, PRESENT, ABSENT } from '../src/scoring.js';
import { TIPS, createTipCycle } from '../src/tips.js';
import { WORDS_VERSION } from '../src/words-version.js';
import { createCountdown, formatClock } from '../src/timer.js';
import { WIN_PHRASES, LOSS_PHRASES, TIMEOUT_PHRASES, tierFor, createPhrasePicker } from '../src/praise.js';
import { createHash } from 'node:crypto';

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

/* --- cache busting --- */

test('the words version matches the lists on disk', () => {
  // words.js appends this to every list request. If it goes stale, browsers
  // keep serving a cached list and reject words the current build accepts --
  // which is exactly how "lured" came to be refused.
  const dir = new URL('../words/', import.meta.url);
  const digest = createHash('sha256');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    digest.update(name);
    digest.update(readFileSync(new URL(name, dir)));
  }
  assert.equal(
    WORDS_VERSION,
    digest.digest('hex').slice(0, 12),
    'word lists changed without rebuilding: run `npm run words`',
  );
});

test('common inflected forms are legal guesses', () => {
  const words = `lured lures luring baked baking hiked hiking carried carries
    hoped hoping stared staring saved saving moved moving typed typing
    tried tries cried dried asked asking walked talked jumped poured
    boxes dishes churches buses foxes wishes taxes
    happier happiest bigger biggest easier earlier later latest`.split(/\s+/);
  const lists = Object.fromEntries(lengths.map((n) => [n, new Set(read(`dict-${n}.txt`))]));
  const missing = words.filter((w) => w.length >= 4 && w.length <= 9 && !lists[w.length].has(w));
  assert.deepEqual(missing, [], `these should be legal guesses: ${missing}`);
});

/* --- countdown --- */

function fakeClock() {
  let t = 0;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('a fresh countdown reads the full duration', () => {
  assert.equal(formatClock(120000), '2:00');
  const now = fakeClock();
  const c = createCountdown(120000, now);
  c.start();
  assert.equal(formatClock(c.remaining()), '2:00');
});

test('the countdown drains in real time and then expires', () => {
  const now = fakeClock();
  const c = createCountdown(120000, now);
  c.start();
  now.advance(30000);
  assert.equal(formatClock(c.remaining()), '1:30');
  now.advance(89500);
  assert.equal(c.expired(), false, 'half a second left is not expired');
  now.advance(500);
  assert.equal(c.remaining(), 0);
  assert.equal(c.expired(), true);
});

test('pausing freezes the clock and resuming gives the time back', () => {
  const now = fakeClock();
  const c = createCountdown(120000, now);
  c.start();
  now.advance(20000);
  c.pause();
  now.advance(60000);              // a minute spent reading the rules
  assert.equal(formatClock(c.remaining()), '1:40', 'paused time was counted');
  c.resume();
  now.advance(10000);
  assert.equal(formatClock(c.remaining()), '1:30');
});

test('a stopped countdown never expires', () => {
  const now = fakeClock();
  const c = createCountdown(120000, now);
  c.start();
  now.advance(200000);
  c.stop();
  assert.equal(c.expired(), false);
  assert.equal(c.running, false);
});

test('clock formatting pads seconds and rounds up', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(9000), '0:09');
  assert.equal(formatClock(61000), '1:01');
});

/* --- end-of-round phrases --- */

test('the winning tier follows where the guess landed, not a fixed index', () => {
  // a five-letter word allows six tries, a nine-letter word ten
  assert.equal(tierFor(1, 6), 'first');
  assert.equal(tierFor(2, 6), 'second');
  assert.equal(tierFor(3, 6), 'third');
  assert.equal(tierFor(4, 6), 'middle');
  assert.equal(tierFor(5, 6), 'nearLast');
  assert.equal(tierFor(6, 6), 'last');

  // guess six is a comfortable finish on a long word, not a last-gasp save
  assert.equal(tierFor(6, 10), 'middle');
  assert.equal(tierFor(9, 10), 'nearLast');
  assert.equal(tierFor(10, 10), 'last');
});

test('a one-guess win is the top tier even on the shortest board', () => {
  assert.equal(tierFor(1, 5), 'first');
});

test('phrases are our own, not the ones Wordle ships', () => {
  const wordle = ['genius', 'magnificent', 'impressive', 'splendid', 'great', 'phew'];
  const all = [...Object.values(WIN_PHRASES).flat(), ...LOSS_PHRASES, ...TIMEOUT_PHRASES];
  for (const phrase of all) {
    assert.ok(!wordle.includes(phrase.toLowerCase().replace(/[!.]/g, '')), `"${phrase}" is Wordle's`);
  }
});

test('every tier has phrases to draw from', () => {
  for (const [tier, list] of Object.entries(WIN_PHRASES)) {
    assert.ok(list.length >= 3, `${tier} has only ${list.length}`);
  }
});

test('a phrase never immediately repeats itself', () => {
  const picker = createPhrasePicker();
  let previous = null;
  for (let i = 0; i < 200; i++) {
    const phrase = picker.win(3, 6);   // same tier every time, the hardest case
    assert.notEqual(phrase, previous, 'the same phrase came up twice running');
    previous = phrase;
  }
});
