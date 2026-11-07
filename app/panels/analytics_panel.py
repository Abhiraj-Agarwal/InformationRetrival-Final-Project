"""Analytics panel: reads saved experiment results (never computes numbers itself)."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st

RESULTS = Path(__file__).resolve().parents[2] / "experiments" / "results"


def render(collection: str) -> None:
    files = sorted(RESULTS.glob(f"eval_{collection}_*_latest.json"))
    if not files:
        st.info(f"No saved results for `{collection}` yet. Run `make eval-quick` or `make eval`.")
        return
    f = st.selectbox("Result file", files, format_func=lambda p: p.name)
    d = json.loads(Path(f).read_text())
    st.caption(f"Saved {d['timestamp_utc']} · split {d['split']} · {d['n_queries']} queries · "
               f"{d['hardware'].get('cpu', '')} ({d['hardware'].get('cpu_count')} CPUs)")
    rows = []
    for sid, r in d["systems"].items():
        a = r["aggregate"]
        rows.append({"ID": sid, "system": r["label"], **{k: round(a.get(k, 0), 3) for k in ("P@5", "Recall@10", "MAP", "NDCG@10")},
                     "mean cost": round(r["mean_cost"], 2), "escalated": f"{r['escalation_rate']:.0%}",
                     "median ms": round(r["latency_median_ms"], 2), "p95 ms": round(r["latency_p95_ms"], 2)})
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    if d.get("ablations"):
        st.subheader("Ablations (from S8)")
        st.dataframe(pd.DataFrame([{"ablation": k, "NDCG@10": round(v["aggregate"]["NDCG@10"], 3),
                                    "mean cost": round(v["mean_cost"], 2)} for k, v in d["ablations"].items()]),
                     hide_index=True)
    figs = sorted((RESULTS / "figures").glob(f"{collection}_{d['split']}_*.png"))
    for p in figs:
        st.image(str(p), use_container_width=True)
