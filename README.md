# Endless Words

A Wordle-style word game with two changes to the original: you pick how long the
word is (4–9 letters), and you can play as many rounds as you like instead of
waiting for tomorrow's puzzle.

Everything else follows Wordle: one more guess than the word is long, green for
a letter in the right place, yellow for a letter in the wrong place, a colour-coded
keyboard, and an optional hard mode that forces you to reuse every revealed hint.
Stats are kept per word length, so your 5-letter streak is separate from your
9-letter one.

No frameworks, no build step — plain HTML, CSS and ES modules.

## Running it locally

The game fetches its word lists, so opening `index.html` straight from disk
won't work; it needs to be served over HTTP.

```sh
npm start          # python3 -m http.server 8000
open http://localhost:8000
```

## Tests

```sh
npm test           # node --test
```

The suite covers the scoring rules (including the duplicate-letter cases that
are easy to get wrong), hard-mode validation, and the shape of the shipped word
lists — every answer is the right length and is itself a legal guess.

## Deploying to GitHub Pages

The site is static and served from the repository root, so there is nothing to
build.

1. Push this repository to GitHub with `main` as the default branch.
2. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs the tests and then
   publishes, and the site appears at
   `https://<your-username>.github.io/<repo-name>/`.

All asset paths are relative, so the game works from a project subpath without
any configuration.

## Word lists

Two lists per length live in `words/` and are fetched on demand when you pick a
length:

| File | Role |
| --- | --- |
| `answers-N.txt` | ~1,400–2,100 common words; solutions are drawn only from here, so a round is always winnable |
| `dict-N.txt` | 4,600–29,000 words; the legal-guess set, kept permissive so obscure-but-real guesses are accepted |

`scripts/build-words.py` regenerates both (`npm run words`). It takes Google's
20k-most-frequent English words for the answer pool and keeps only those a
case-sensitive spelling dictionary recognises as lowercase words — that step is
what filters out proper nouns like *Cisco* and *Texas* and contraction forms
like *didnt*, which plain word lists happily contain. The guess list comes from
the system dictionary at `/usr/share/dict/words`. `scripts/blocklist.txt` keeps
slurs and explicit terms out of the answer pool; they remain valid guesses.

Regenerating requires network access and a system word list, and is only needed
if you want to change the lengths or the sources.

## Layout

```
index.html            markup and the two modals
styles.css            Wordle's palette as CSS custom properties; dark theme swaps values
src/scoring.js        pure game rules — scoring, hard mode, share grid (no DOM)
src/words.js          lazy per-length word list loading and answer selection
src/stats.js          per-length stats and preferences in localStorage
src/main.js           board, keyboard, input handling, round lifecycle
scripts/              word list generation
test/                 node:test suite
```

`src/scoring.js` is deliberately free of DOM and storage access so the rules can
be tested directly.
