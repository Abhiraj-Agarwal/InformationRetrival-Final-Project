"""UI smoke test (headless). Skipped when the cs indexes are not built yet."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(not (ROOT / "indexes" / "cs" / "embeddings.npy").exists(),
                                reason="cs indexes not built (run make data index)")


def test_app_runs_example_queries():
    from streamlit.testing.v1 import AppTest

    at = AppTest.from_file(str(ROOT / "app" / "streamlit_app.py"), default_timeout=180)
    at.run()
    assert not at.exception
    for q in ["TF-IDF formula and inverse document frequency", "Compare BM25 and TF-IDF",
              "How can a search engine identify the importance of a webpage?", "semaphore AND NOT deadlock"]:
        at.text_input[0].set_value(q).run()
        assert not at.exception, q
        assert any("results" in m.value for m in at.markdown), q
