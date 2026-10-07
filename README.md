# Guess Da Word

### ▶ [Play it here](https://shubhi-stva.github.io/guess-da-word/)

A fun twist on Wordle, the classic daily word game from The New York Times.
This is an independent fan project, not affiliated with, endorsed by, or
sponsored by The New York Times Company. Wordle is a trademark of The New York
Times Company.

A Wordle-style word game with two changes to the original: you pick how long the
word is (4 to 9 letters), and you can play as many rounds as you like instead of
waiting for tomorrow's puzzle.

A welcome screen opens on every visit and holds the game until you press Play;
everything else follows Wordle: one more guess than the word is long, green for
a letter in the right place, yellow for a letter in the wrong place, a colour-coded
keyboard, and an optional hard mode that forces you to reuse every revealed hint.
Stats are kept per word length, so your 5-letter streak is separate from your
9-letter one. The record panel shows all six lengths at once as a ladder of win
rates. You can browse any of them and start a round at that length from there. Each round is on a two-minute clock that opens with a 3-2-1
count-in, pauses whenever a dialog is open, and can be switched off in
settings. Between rounds a strategy
tip occasionally appears above the keyboard, always about the game itself,
never about the word in play, and also optional.


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
lists: every answer is the right length and is itself a legal guess.

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
| `answers-N.txt` | roughly 1,400 to 2,100 common words; solutions are drawn only from here, so a round is always winnable |
| `dict-N.txt` | 7,500 to 54,000 words; the legal-guess set, kept as permissive as possible so a real word is never rejected |

`scripts/build-words.py` regenerates both (`npm run words`) and stamps
`src/words-version.js` with a fingerprint of the generated files. `words.js`
appends that to every list request, because GitHub Pages serves them with
`max-age=600` and a browser holding an older copy would otherwise keep
rejecting words the current build accepts. A test fails if the stamp and the
lists ever drift apart.

The **answer pool** takes Google's 20k-most-frequent English words and keeps
only those a case-sensitive spelling dictionary recognises as lowercase words.
That step is what filters out proper nouns like *Cisco* and *Texas* and
contraction forms like *didnt*, which plain word lists happily contain.
`scripts/blocklist.txt` keeps slurs and explicit terms out of the pool.

The **guess list** is the union of a 370k-entry English word list, the system
dictionary at `/usr/share/dict/words`, a spelling dictionary's headwords, the
frequency list, and `scripts/slang.txt`, a curated list of well-known slang
and modern vocabulary (*selfie*, *podcast*, *emoji*, *yeet*) that older
dictionaries predate. Regular inflections of each slang entry are generated, so
the file lists base forms only. Solutions are never drawn from it; it only
widens what the game accepts.

Regenerating requires network access and a system word list, and is only needed
if you want to change the lengths or the sources.

## Layout

```
index.html            markup and the two modals
styles.css            Wordle's palette as CSS custom properties; dark theme swaps values
src/scoring.js        pure game rules: scoring, hard mode, share grid (no DOM)
src/praise.js         what the game says at the end of a round, banded by pace
src/tips.js           the strategy tips and the no-repeat cycle that serves them
src/timer.js          the pausable countdown behind the two-minute round clock
src/words-version.js  generated fingerprint of words/, used to bust stale caches
src/words.js          lazy per-length word list loading and answer selection
src/stats.js          per-length stats and preferences in localStorage
src/main.js           splash, board, keyboard, input handling, round lifecycle
scripts/              word list generation
test/                 node:test suite
```

`src/scoring.js` is deliberately free of DOM and storage access so the rules can
be tested directly.
