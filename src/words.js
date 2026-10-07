/**
 * Word list loading. Two lists per length:
 *   answers-N.txt — common words, the only ones ever chosen as a solution
 *   dict-N.txt    — a much larger dictionary; anything here is a legal guess
 * Lists are fetched lazily per length and cached for the session.
 */

import { WORDS_VERSION } from './words-version.js';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 9;

const cache = new Map();

async function fetchList(name) {
  // The version is a fingerprint of the generated lists, so a browser holding
  // an older copy refetches as soon as the lists change. GitHub Pages serves
  // these with max-age=600; without the stamp a cached list keeps rejecting
  // words the current build accepts.
  const res = await fetch(`words/${name}.txt?v=${WORDS_VERSION}`);
  if (!res.ok) throw new Error(`Could not load words/${name}.txt (${res.status})`);
  return (await res.text()).split('\n').map((w) => w.trim()).filter(Boolean);
}

/** Resolves to { answers: string[], valid: Set<string> } for the given length. */
export function loadWords(length) {
  if (!cache.has(length)) {
    const p = Promise.all([fetchList(`answers-${length}`), fetchList(`dict-${length}`)])
      .then(([answers, dict]) => ({ answers, valid: new Set([...dict, ...answers]) }))
      .catch((err) => {
        cache.delete(length); // let a later attempt retry instead of caching the failure
        throw err;
      });
    cache.set(length, p);
  }
  return cache.get(length);
}

/**
 * Picks a random answer, avoiding anything in `recent` so back-to-back rounds
 * don't repeat. Falls back to an unrestricted pick if `recent` covers the pool.
 */
export function pickAnswer(answers, recent = []) {
  const skip = new Set(recent);
  const pool = answers.filter((w) => !skip.has(w));
  const from = pool.length ? pool : answers;
  return from[Math.floor(Math.random() * from.length)];
}
