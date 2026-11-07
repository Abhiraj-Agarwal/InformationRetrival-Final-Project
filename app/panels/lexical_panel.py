"""Lexical panel: per-term BM25/TF-IDF contributions, postings touched, eliminated terms."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from contextweave.lexical.explain import term_rows

LEXICAL = ("bm25", "bm25_champion", "bm25_ie", "tfidf", "expansion", "boolean")


def term_table(result) -> None:
    rows = term_rows(result)
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')


def render(resp, system) -> None:
    if resp is None:
        st.info("Run a search first.")
        return
    st.subheader("Query processing")
    st.write("Normalised terms:", ", ".join(f"`{t}`" for t in resp.query.terms) or "—")
    idf = [{"term": t, "df": system.index.df(t), "idf": round(system.index.idf(t), 3),
            "bm25 idf": round(system.scorer.idf(t), 3)} for t in dict.fromkeys(resp.query.terms)]
    st.dataframe(pd.DataFrame(idf), hide_index=True, width='stretch')
    ran = [m for m in resp.extras["methods_run"] if m in LEXICAL]
    if not ran:
        st.info("No lexical method ran for this query.")
        return
    for m in ran:
        stt = resp.extras["stats"].get(m, {})
        st.subheader(f"`{m}`")
        c = st.columns(4)
        c[0].metric("postings touched", f"{stt.get('postings_touched', 0):,}")
        c[1].metric("passages scored", f"{stt.get('passages_scored', 0):,}")
        c[2].metric("of collection", f"{stt.get('passages_scored', 0) / max(stt.get('N', 1), 1):.1%}")
        c[3].metric("latency", f"{stt.get('latency_ms', 0):.2f} ms")
        if stt.get("eliminated_terms"):
            st.caption("Index Elimination dropped: " + ", ".join(stt["eliminated_terms"]))
        rows = []
        for r in resp.extras["lists"].get(m, [])[:10]:
            p = system.store[r.passage_id]
            rows.append({"rank": r.rank, "score": round(r.score, 3), "title": p.title[:70], "page": p.page,
                         "terms": ", ".join(f"{x['term']}:{x['score']:.2f}" for x in term_rows(r))})
        st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
