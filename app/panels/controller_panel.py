"""Controller panel: the full trace of routing, confidence, escalation and stopping."""
from __future__ import annotations

import pandas as pd
import streamlit as st

ICON = {"route": "🧭", "retrieve": "📥", "confidence": "📏", "escalate": "⬆️", "stop": "⏹️"}


def render(resp, system) -> None:
    if resp is None:
        st.info("Run a search first.")
        return
    c = st.columns(4)
    c[0].metric("total cost", f"{resp.total_cost:.2f}")
    c[1].metric("budget", f"{resp.extras.get('budget', 0):.1f}")
    c[2].metric("τ", f"{resp.extras.get('tau', 0):.2f}", help=f"source: {resp.extras.get('tau_source')}")
    c[3].metric("latency", f"{resp.total_latency_ms:.1f} ms")
    rows = []
    for i, s in enumerate(resp.trace, 1):
        rows.append({"#": i, "step": f"{ICON.get(s.action, '')} {s.action}", "method": s.method or "",
                     "cost": round(s.cost, 2), "budget left": round(s.budget_left, 2),
                     "confidence": None if s.confidence is None else round(s.confidence, 3),
                     "ms": round(s.latency_ms, 2), "note": s.note})
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    conf_steps = [s for s in resp.trace if s.action == "confidence"]
    if conf_steps:
        st.subheader("Confidence signals per step")
        sig = pd.DataFrame([{k: round(v, 3) for k, v in s.signals.items() if isinstance(v, (int, float))}
                            for s in conf_steps])
        sig.insert(0, "confidence", [round(s.confidence, 3) for s in conf_steps])
        st.dataframe(sig, hide_index=True, use_container_width=True)
        st.caption("confidence = sigmoid(bias + Σ wᵢ·signalᵢ); weights in config/settings.yaml → controller.confidence_weights")
    route = resp.trace[0] if resp.trace and resp.trace[0].action == "route" else None
    if route:
        with st.expander("Query features used by the router"):
            st.json(route.signals)
