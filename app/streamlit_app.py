"""ContextWeave — Streamlit main page: search box, controls, results, and panels.

    streamlit run app/streamlit_app.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.panels import analytics_panel, controller_panel, judge_panel, lexical_panel, semantic_panel  # noqa: E402
from contextweave.controller.engine import models_dir  # noqa: E402
from contextweave.core.config import load_config  # noqa: E402
from contextweave.indexing.snippets import make_snippet  # noqa: E402

st.set_page_config(page_title="ContextWeave", page_icon="🧵", layout="wide")

EXAMPLES = {
    "cs": ["TF-IDF formula and inverse document frequency", "How can a search engine identify the importance of a webpage?",
           "Compare BM25 and TF-IDF", "How can we prevent multiple processes from corrupting shared information?",
           "semaphore AND NOT deadlock", "TCP Reno fast retransmit fast recovery"],
    "scifact": ["0-dimensional biomaterials show inductive properties.", "ALDH1 expression is associated with poorer prognosis for breast cancer primary tumors."],
    "nfcorpus": ["Why Deep Fried Foods May Cause Cancer", "breast cancer", "statins"],
}
MODES = {"Auto (adaptive)": "auto", "BM25": "bm25", "TF-IDF": "tfidf", "Dense": "dense", "Hybrid (fixed)": "hybrid",
         "Boolean": "boolean", "BM25 + Champion + IE": "bm25_champion", "Routing only": "route"}


def available_collections() -> list[str]:
    cfg = load_config()
    base = Path(cfg["paths"]["indexes"])
    return [c for c in ("cs", "scifact", "nfcorpus") if (base / c / "inverted.pkl").exists()] or ["cs"]


@st.cache_resource(show_spinner="Loading indexes and the embedding model…")
def get_system(collection: str):
    from contextweave.system import load_system

    cfg = load_config(overrides={"collection": collection})
    system = load_system(cfg, collection=collection)
    if system.embedder is not None:  # load the model now so the first search is not slow
        system.embedder.encode(["warm-up"])
    return system


def tuned_defaults(collection: str, cfg) -> dict:
    p = models_dir(collection) / "tuned.json"
    t = json.loads(p.read_text()).get("S8", {}) if p.exists() else {}
    return {"tau": float(t.get("tau", cfg["controller"]["tau"])), "budget": float(t.get("budget", cfg["controller"]["budget"]))}


def sidebar(collection: str, system) -> dict:
    cfg = system.cfg
    sb = st.sidebar
    sb.header("Controls")
    mode_label = sb.selectbox("Mode", list(MODES), index=0)
    domains = sb.multiselect("Domain filter", system.store.domains(), default=[],
                             help="Restrict every retriever to these domains")
    d = tuned_defaults(collection, cfg)
    costs = {**cfg["costs"], **(cfg.get("costs_by_collection") or {}).get(collection, {})}
    max_budget = float(round(sum(costs[m] for m in ("bm25_champion", "bm25", "dense", "expansion")) + 1))
    budget = sb.slider("Budget (cost units / query)", 0.5, max_budget, min(d["budget"], max_budget), 0.5,
                       help="1 unit = median time of one full BM25 query (measured)")
    tau = sb.slider("Confidence threshold τ", 0.0, 1.0, d["tau"], 0.05)
    with sb.expander("ContextWeave+ extensions"):
        feats = {"qpp_signals": st.checkbox("QPP confidence signals (NQC, WIG)"),
                 "voc_policy": st.checkbox("Value-of-computation escalation",
                                           disabled=not (models_dir(collection) / "voc_gain_model.json").exists()),
                 "risk_controlled_tau": st.checkbox("Risk-controlled τ (Learn-then-Test)",
                                                    disabled=not (models_dir(collection) / "risk_tau.json").exists()),
                 "qpp_fusion": st.checkbox("QPP-percentile fusion",
                                           disabled=not (models_dir(collection) / "qpp_fusion.json").exists())}
        exp = st.checkbox("Query expansion in the ladder", value=bool(cfg["expansion"]["enabled"]))
    sb.caption("Costs: " + ", ".join(f"{m} {costs[m]:.1f}" for m in ("bm25_champion", "bm25", "dense", "expansion")))
    return {"mode": MODES[mode_label], "domains": domains, "budget": budget, "tau": tau, "features": feats,
            "expansion": exp}


def render_results(resp, system) -> None:
    st.markdown(f"**{len(resp.results)} results** · mode `{resp.mode}` · cost **{resp.total_cost:.2f}** units · "
                f"{resp.total_latency_ms:.1f} ms · methods run: {', '.join(resp.extras['methods_run'])}")
    if resp.extras.get("stop_reason"):
        st.caption(f"Controller stopped: {resp.extras['stop_reason']}")
    terms = set(resp.query.terms) | {a["term"] for st_ in resp.extras["stats"].values() for a in st_.get("added_terms", [])}
    for r in resp.results:
        p = system.store[r.passage_id]
        snip = make_snippet(p.text, terms, system.normalize, window=45)
        page = f"p. {p.page}" if p.page else ""
        with st.container(border=True):
            st.markdown(f"**{r.rank}. {p.title}** &nbsp; <span style='color:#52514e'>{page} · {p.domain} · "
                        f"`{r.method}` · score {r.score:.3f}</span>", unsafe_allow_html=True)
            st.markdown(snip["html"], unsafe_allow_html=True)
            with st.expander("Why this result?"):
                e = r.explanation or {}
                cols = st.columns(3)
                if "alpha" in e:
                    cols[0].metric("lexical (norm)", f"{e.get('lexical_norm', 0):.2f}")
                    cols[1].metric("semantic (norm)", f"{e.get('semantic_norm', 0):.2f}")
                    cols[2].metric("α (lexical weight)", f"{e['alpha']:.2f}")
                if e.get("cosine") is not None:
                    st.caption(f"cosine similarity: {e['cosine']:.3f}")
                lexical_panel.term_table(r)
                st.caption(f"{p.source} · {r.passage_id}")


def main() -> None:
    st.title("🧵 ContextWeave")
    st.caption("Confidence-aware, budget-constrained adaptive retrieval — every decision is shown.")
    cols = available_collections()
    collection = st.sidebar.selectbox("Collection", cols, index=0)
    system = get_system(collection)
    ctl = sidebar(collection, system)
    tabs = st.tabs(["🔎 Search", "📚 Lexical", "🧠 Semantic", "🧭 Controller trace", "📈 Analytics", "✅ Judge"])
    with tabs[0]:
        ex = st.pills("Examples", EXAMPLES.get(collection, []), selection_mode="single") if hasattr(st, "pills") else None
        query = st.text_input("Search", value=ex or st.session_state.get("last_query", ""),
                              placeholder="Try a technical term or a natural-language question…")
        if query:
            st.session_state["last_query"] = query
            eng = system.engine(features=ctl["features"], expansion=ctl["expansion"], budget=ctl["budget"],
                                tau=None if ctl["features"]["risk_controlled_tau"] else ctl["tau"])
            filters = {"domains": ctl["domains"]} if ctl["domains"] else {}
            resp = eng.search(query, mode=ctl["mode"], filters=filters)
            st.session_state["resp"] = resp
            render_results(resp, system)
    resp = st.session_state.get("resp")
    with tabs[1]:
        lexical_panel.render(resp, system)
    with tabs[2]:
        semantic_panel.render(resp, system)
    with tabs[3]:
        controller_panel.render(resp, system)
    with tabs[4]:
        analytics_panel.render(collection)
    with tabs[5]:
        judge_panel.render(collection, system)


if __name__ == "__main__":
    main()
