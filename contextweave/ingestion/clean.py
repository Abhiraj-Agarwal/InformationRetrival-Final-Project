"""Cleaning: repeated headers/footers, hyphenated line breaks, short pages, references."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter

_LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
              " ": " ", "­": ""}
_DIGITS = re.compile(r"\d+")
_REF_HEAD = re.compile(r"^\s*(references|bibliography)\s*$", re.I)


def _line_key(line: str) -> str:
    """Key used to detect repeated lines; page numbers are masked."""
    return _DIGITS.sub("#", line.strip().lower())


def find_repeated_lines(pages: list[str], min_share: float = 0.4, edge: int = 3) -> set[str]:
    """Lines (masked) among the first/last ``edge`` lines of a page that repeat on
    at least ``min_share`` of pages are treated as headers/footers."""
    if len(pages) < 3:
        return set()
    counts: Counter[str] = Counter()
    for text in pages:
        lines = [ln for ln in text.splitlines() if ln.strip()]
        keys = {_line_key(ln) for ln in lines[:edge] + lines[-edge:]}
        counts.update(keys)
    thresh = max(2, int(min_share * len(pages)))
    return {k for k, c in counts.items() if c >= thresh and k not in {"", "#"}} | {"#"}


def normalise_unicode(text: str) -> str:
    for a, b in _LIGATURES.items():
        text = text.replace(a, b)
    return unicodedata.normalize("NFKC", text)


def clean_page(text: str, repeated: set[str]) -> str:
    """Remove header/footer lines, join hyphenated line breaks, collapse whitespace."""
    text = normalise_unicode(text)
    lines = [ln for ln in text.splitlines() if _line_key(ln) not in repeated]
    text = "\n".join(lines)
    text = re.sub(r"(\w)-\n(?=[a-z])", r"\1", text)  # hyphenated line break: "re-\ntrieval"
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    return text.strip()


def drop_references(pages: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Cut the document at a final 'References'/'Bibliography' heading
    (only if it appears in the last 40% of pages)."""
    n = len(pages)
    for idx in range(n - 1, int(n * 0.6) - 1, -1):
        pno, text = pages[idx]
        lines = text.splitlines()
        for li, ln in enumerate(lines):
            if _REF_HEAD.match(ln):
                kept = "\n".join(lines[:li])
                return pages[:idx] + ([(pno, kept)] if kept.strip() else [])
    return pages


def clean_document(pages: list[tuple[int, str]], min_page_chars: int = 300,
                   repeat_share: float = 0.4) -> tuple[list[tuple[int, str]], int]:
    """Clean all pages of one document. Returns (kept pages, number skipped)."""
    pages = drop_references(pages)
    repeated = find_repeated_lines([t for _, t in pages], repeat_share)
    kept, skipped = [], 0
    for pno, text in pages:
        c = clean_page(text, repeated)
        if len(c) < min_page_chars:
            skipped += 1
            continue
        kept.append((pno, c))
    return kept, skipped
