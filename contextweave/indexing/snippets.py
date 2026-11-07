"""Query-biased snippets: the window of a passage containing the most query terms,
with the matching words highlighted."""
from __future__ import annotations

import html
from typing import Callable, Iterable


def make_snippet(text: str, query_terms: Iterable[str], normalize: Callable[[str], list[str]],
                 window: int = 40, mark: tuple[str, str] = ("<mark>", "</mark>")) -> dict:
    """Return {"html": highlighted window, "start": word offset, "hits": n matched words}.

    The window size is in words. Each word is normalised with the shared pipeline so
    "Retrieval" highlights for the query term "retriev".
    """
    qset = set(query_terms)
    words = text.split()
    if not words:
        return {"html": "", "start": 0, "hits": 0}
    hit = [1 if qset.intersection(normalize(w)) else 0 for w in words]
    w = min(window, len(words))
    cur = sum(hit[:w])
    best, best_start = cur, 0
    for s in range(1, len(words) - w + 1):  # sliding window, O(n)
        cur += hit[s + w - 1] - hit[s - 1]
        if cur > best:
            best, best_start = cur, s
    out = []
    for i in range(best_start, best_start + w):
        token = html.escape(words[i])
        out.append(f"{mark[0]}{token}{mark[1]}" if hit[i] else token)
    prefix = "… " if best_start > 0 else ""
    suffix = " …" if best_start + w < len(words) else ""
    return {"html": prefix + " ".join(out) + suffix, "start": best_start, "hits": best}
