/**
 * Occasional strategy tips.
 *
 * These are deliberately about the game itself -- never about the round in
 * progress. Nothing here reads the answer or the player's guesses, so a tip can
 * never leak a hint, and the copy is written to stay true whatever is on screen.
 */

export const TIPS = [
  'Opening with a word packed with common letters — CRANE, SLATE, AUDIO — rules out the most at once.',
  'Vowels are useful, but R, S, T, L and N turn up in more words than most vowels do.',
  'A letter can appear twice. A grey tile only means that copy of the letter is not in the word.',
  'Yellow means the letter is in the word, just not there. Move it somewhere new.',
  'Longer words give you more guesses, so the first two can afford to be pure reconnaissance.',
  'A guess you know cannot win is still worth playing if it eliminates a lot of letters.',
  'Answers are always common words, but you can guess anything in the dictionary.',
  'Slang counts. SELFIE, PODCAST, EMOJI and YEET are all accepted guesses.',
  'Once you have the stem, common endings are worth a try: -ING, -ED, -ERS, -TION.',
  'Hard mode makes you reuse every hint you have uncovered. Short words get surprisingly tough.',
  'Your stats are kept separately for each word length, so a new length starts you with a clean slate.',
  'Stuck between two letters in the same slot? Spend a guess on a word containing both.',
  'The keyboard colours track every letter you have tried. Grey keys are as useful as green ones.',
  'Doubled letters catch people out. If a word feels one letter short, try doubling a consonant.',
  'Switching word length any time starts a fresh word — the current round is not scored.',
];

/**
 * Hands out tips in a shuffled order and only starts repeating once every tip
 * has been seen, so a session never shows the same one twice in a row.
 */
export function createTipCycle(tips = TIPS, random = Math.random) {
  let queue = [];
  let previous = null;

  const refill = () => {
    queue = tips.slice();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    // next() pops from the end, so make sure the new cycle does not open with
    // the tip the previous one closed on.
    if (queue.length > 1 && queue[queue.length - 1] === previous) {
      [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];
    }
  };

  return function next() {
    if (!queue.length) refill();
    previous = queue.pop();
    return previous;
  };
}
