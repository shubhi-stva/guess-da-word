#!/usr/bin/env python3
"""Regenerate the word lists in words/.

Two lists per length:

  answers-N.txt  The pool solutions are drawn from. Common words only, so a
                 round is always winnable: Google's 20k-most-frequent English
                 words, kept only if a case-sensitive spelling dictionary
                 recognises them as *lowercase* words. That last step is what
                 removes proper nouns (Texas, Cisco, Paris) and contraction
                 forms (didnt, thats) that a plain word list happily contains.

  dict-N.txt     The legal-guess set: deliberately permissive, so an obscure
                 but real guess is accepted. Webster's (the system word list)
                 plus every answer, since the answer must always be guessable.

Sources are fetched over the network; nothing here needs to run at play time.
Usage: python3 scripts/build-words.py
"""

import re
import sys
from pathlib import Path
from urllib.request import urlopen

LENGTHS = range(4, 10)
ROOT = Path(__file__).resolve().parent.parent
SYSTEM_WORDS = Path("/usr/share/dict/words")

FREQUENCY_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt"
# Hunspell dictionary: case-sensitive, so a capitalised entry marks a proper noun.
SPELLING_URL = "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/en_US.dic"


def fetch(url):
    with urlopen(url, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def lowercase_roots(dic_text):
    """Lowercase headwords from a .dic file, dropping the /AFFIX suffix flags."""
    roots = set()
    for line in dic_text.splitlines()[1:]:
        word = line.split("/", 1)[0].strip()
        if word and re.fullmatch(r"[a-z]+", word):
            roots.add(word)
    return roots


def is_english_word(word, roots):
    """True if `word` is a known lowercase word, or a regular inflection of one.

    The .dic file stores roots plus affix flags rather than surface forms, so
    common inflections ("guesses", "potatoes", "abilities") are reconstructed
    here instead of expanding the full affix rules.
    """
    if word in roots:
        return True
    candidates = []
    for suffix in ("s", "es", "ed", "ing"):
        if word.endswith(suffix):
            candidates.append(word[: -len(suffix)])
    if word.endswith("ies"):
        candidates.append(word[:-3] + "y")
    if word.endswith(("ing", "ed")):
        # dropped silent e: "hoping" -> "hope", "hoped" -> "hope"
        candidates.append(word[:-3] + "e" if word.endswith("ing") else word[:-1])
    return any(c in roots for c in candidates)


def main():
    if not SYSTEM_WORDS.exists():
        sys.exit(f"{SYSTEM_WORDS} not found; install a system word list (wamerican on Debian).")

    blocked = {
        w.strip()
        for w in (ROOT / "scripts" / "blocklist.txt").read_text().splitlines()
        if w.strip()
    }

    print("fetching frequency list...")
    frequent = [w.lower() for w in fetch(FREQUENCY_URL).split() if w.isalpha()]
    print("fetching spelling dictionary...")
    roots = lowercase_roots(fetch(SPELLING_URL))

    webster = {
        w for w in SYSTEM_WORDS.read_text("utf-8", "replace").split()
        if re.fullmatch(r"[a-z]+", w)
    }

    out = ROOT / "words"
    out.mkdir(exist_ok=True)

    for n in LENGTHS:
        answers = sorted({
            w for w in frequent
            if len(w) == n and w not in blocked and is_english_word(w, roots)
        })
        legal = sorted({w for w in webster if len(w) == n} | set(answers))

        (out / f"answers-{n}.txt").write_text("\n".join(answers) + "\n")
        (out / f"dict-{n}.txt").write_text("\n".join(legal) + "\n")
        print(f"{n} letters: {len(answers):>5} answers, {len(legal):>6} legal guesses")


if __name__ == "__main__":
    main()
