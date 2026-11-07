"""Semantic panel: dense cosine scores, lexical/semantic agreement, expansion terms."""
from __future__ import annotations

import pandas as pd
import streamlit as st


def render(resp, system) -> None:
    if resp is None:
        st.info("Run a search first.")
        return
    lists = resp.extras["lists"]
    if "dense" not in lists and "expansion" not in lists:
        st.info("The controller did not need semantic search for this query (or the mode is lexical-only).")
    if "dense" in lists:
        st.subheader("Dense retrieval (all-MiniLM-L6-v2 + FAISS flat inner product)")
        stt = resp.extras["stats"].get("dense", {})
        c = st.columns(3)
        c[0].metric("query encoding", f"{stt.get('encode_ms', 0):.1f} ms")
        c[1].metric("total", f"{stt.get('latency_ms', 0):.1f} ms")
        c[2].metric("vectors searched", f"{stt.get('passages_scored', 0):,}")
        rows = []
        lex = next((lists[m] for m in ("expansion", "bm25", "bm25_champion", "tfidf") if m in lists), [])
        lex_ids = {r.passage_id for r in lex[:10]}
        for r in lists["dense"][:10]:
            p = system.store[r.passage_id]
            rows.append({"rank": r.rank, "cosine": round(r.score, 4), "title": p.title[:70], "page": p.page,
                         "also in lexical top 10": r.passage_id in lex_ids})
        st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
        if lex:
            st.caption(f"Agreement with the lexical top 10: {len(lex_ids & {r.passage_id for r in lists['dense'][:10]})}/10")
    if "expansion" in lists:
        st.subheader("Query expansion (pseudo-relevance feedback + embedding drift filter)")
        stt = resp.extras["stats"]["expansion"]
        added = stt.get("added_terms", [])
        if added:
            st.dataframe(pd.DataFrame(added), hide_index=True, width='stretch')
            st.caption(f"Added with weight {system.cfg['expansion']['weight']} and re-ran BM25. "
                       f"Feedback passages: {', '.join(stt.get('feedback', []))}")
        else:
            st.write("No candidate term passed the similarity filter, so the query was not changed.")
