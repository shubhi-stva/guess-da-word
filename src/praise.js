/**
 * What the game says when a round ends.
 *
 * Phrases are chosen by where the winning guess landed in the round rather than
 * by a fixed index, because the number of tries depends on word length: guess
 * six is a comfortable finish on a nine-letter word and a last-gasp save on a
 * five-letter one.
 */

export const WIN_PHRASES = {
  first: [
    'Witchcraft!',
    'First try. Showoff.',
    'Called it cold',
    'Straight out of thin air',
  ],
  second: [
    'Scary good',
    'Two and done',
    'Barely broke a sweat',
    'Ice in your veins',
  ],
  third: [
    'Awesome sauce',
    'Chef’s kiss',
    'Big brain energy',
    'Smooth operator',
  ],
  middle: [
    'Cracked it',
    'Textbook stuff',
    'Detective work',
    'You wore it down',
    'Methodical. Respect.',
  ],
  nearLast: [
    'Cutting it fine',
    'One to spare',
    'Sweaty palms, clean finish',
  ],
  last: [
    'Nail-biter!',
    'By a whisker',
    'Buzzer beater',
    'Down to the wire',
    'Clutch.',
  ],
};

export const LOSS_PHRASES = [
  'That one was sneaky',
  'It got away',
  'Not this time',
  'Sneaky word. Next one is yours.',
];

export const TIMEOUT_PHRASES = [
  'Time’s up',
  'The clock won',
  'Out of time',
];

/**
 * Where a winning guess landed. `rows` is the number of tries the round
 * allowed, so the bands shift with word length.
 */
export function tierFor(guesses, rows) {
  if (guesses <= 1) return 'first';
  if (guesses === rows) return 'last';
  if (guesses === 2) return 'second';
  if (guesses === 3) return 'third';
  if (guesses === rows - 1) return 'nearLast';
  return 'middle';
}

/**
 * Picks phrases at random, never repeating the previous one, so a streak of
 * wins at the same pace does not read like a stuck record.
 */
export function createPhrasePicker(random = Math.random) {
  let previous = null;

  const pick = (list) => {
    const options = list.length > 1 ? list.filter((p) => p !== previous) : list;
    previous = options[Math.floor(random() * options.length)];
    return previous;
  };

  return {
    win: (guesses, rows) => pick(WIN_PHRASES[tierFor(guesses, rows)]),
    loss: () => pick(LOSS_PHRASES),
    timeout: () => pick(TIMEOUT_PHRASES),
  };
}
