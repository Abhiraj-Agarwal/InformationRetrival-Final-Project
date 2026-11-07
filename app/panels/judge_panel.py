"""Judging page: query + pooled passage + buttons 0/1/2, written to benchmark/qrels.tsv.

The pool (top 10 of BM25, TF-IDF, dense, fixed hybrid and the controller, spec §10)
is built once with the button below and stored in benchmark/pool.json.
"""
from __future__ import annotations

import json

import streamlit as st

from contextweave.evaluation.benchmark import bench_dir, build_pool, load_qrels, load_queries, write_qrel


def render(collection: str, system) -> None:
    if collection != "cs":
        st.info("The BEIR collections already have human relevance judgements. Judging is for the `cs` corpus.")
        return
    pool_path = bench_dir(collection) / "pool.json"
    annotator = st.text_input("Your name (for inter-annotator agreement)", key="annotator")
    if not pool_path.exists():
        st.warning("No judging pool yet.")
        if st.button("Build pool (top 10 of 5 systems for every query)"):
            with st.spinner("Pooling…"):
                pool = build_pool(system.engine(), load_queries(collection))
                pool_path.write_text(json.dumps(pool, indent=1))
            st.rerun()
        return
    pool = json.loads(pool_path.read_text())
    queries = {q.qid: q for q in load_queries(collection)}
    qrels = load_qrels(collection)
    todo = [(qid, pid) for qid, pids in pool.items() for pid in pids if pid not in qrels.get(qid, {})]
    done = sum(len(v) for v in pool.values()) - len(todo)
    st.progress(done / max(1, done + len(todo)), text=f"{done} judged · {len(todo)} to go")
    only_q = st.selectbox("Query", ["(next unjudged)"] + list(pool), format_func=lambda q: q if q.startswith("(")
                          else f"{q}: {queries[q].text}")
    items = todo if only_q.startswith("(") else [(only_q, p) for p in pool[only_q]]
    if not items:
        st.success("Everything in the pool is judged. 🎉")
        return
    qid, pid = items[0]
    p = system.store[pid]
    st.markdown(f"### {queries[qid].text}")
    st.caption(f"{qid} · type {queries[qid].type} · {queries[qid].domain}")
    st.markdown(f"**{p.title}** (p. {p.page})")
    st.write(p.text)
    current = qrels.get(qid, {}).get(pid)
    if current is not None:
        st.caption(f"Current grade: {current}")
    c = st.columns(3)
    for g, label in [(0, "0 · not relevant"), (1, "1 · partly relevant"), (2, "2 · highly relevant")]:
        if c[g].button(label, use_container_width=True, key=f"g{g}_{qid}_{pid}"):
            write_qrel(collection, qid, pid, g, annotator.strip().lower().replace(" ", "_"))
            st.rerun()
    st.caption("Guidelines: benchmark/judging_guidelines.md")
