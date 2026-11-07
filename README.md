# ContextWeave

**A confidence-aware, budget-constrained adaptive information retrieval framework** — Information Retrieval course
project. ContextWeave decides *per query* how much retrieval effort to spend: it routes the query to the cheapest
suitable method, estimates from the results whether they are already good enough, and escalates to semantic search,
fusion and query expansion only when confidence is low and the budget allows. Every decision is logged and shown.

On top of the specification, **ContextWeave+** adds four novel, switchable components (all off by default):

| Flag (`config/settings.yaml → features`) | Idea |
|---|---|
| `qpp_signals` | Query-performance-prediction signals (scale-free NQC, bounded WIG) in the confidence estimate |
| `voc_policy` | **Value-of-computation escalation**: take the step with the best *expected NDCG gain per cost unit*, learned from an exhaustive simulation of every escalation order on validation queries; stop when no step is worth its cost |
| `risk_controlled_tau` | **Risk-controlled stopping** with Learn-then-Test: τ is chosen so that, with probability ≥ 1−η, at most δ of queries lose more than ε NDCG@10 versus the full hybrid |
| `qpp_fusion` | Fusion weight α(q) from the two lists' QPP, made comparable by converting each to a validation percentile |

Everything — inverted index, blocked index construction, Boolean retrieval, TF-IDF, BM25, Champion Lists, Index
Elimination, fusion, metrics — is written from scratch. `rank-bm25` and `ir-measures` are used only in tests, where
BM25 matches rank-bm25 score-for-score and every metric matches ir-measures.

## Quick start

```bash
make setup                 # CPU PyTorch + requirements (Python 3.10+)
make data                  # download open PDFs + BEIR SciFact/NFCorpus, extract, clean, chunk
make index                 # inverted index, champion lists, embeddings, FAISS (all collections)
make calibrate-costs       # measure method costs -> config/settings.yaml
make test                  # pytest (44 tests)
make eval-quick            # tune on validation queries + main systems on validation
make eval                  # all systems on test + ablations + sweeps + plots + tables
make app                   # Streamlit UI at http://localhost:8501
```

CLI:

```bash
python main.py search "How can a search engine identify the importance of a webpage?"
python main.py search "semaphore AND NOT deadlock" --mode boolean
python main.py search "statins" --collection nfcorpus --mode hybrid
python main.py evaluate --collection scifact --split val --systems S2,S5,S8
```

## Collections

| Collection | Content | Passages | Queries / judgements |
|---|---|---|---|
| `cs` | 163 open CS documents (OSTEP, Erickson *Algorithms*, CMU 15-445, Red Book, Dordal *Computer Networks*, Croft *Search Engines*, 22 arXiv IR papers) across IR / OS / Networks / DBMS / Algorithms | 7,661 | 80 queries written before any system output (`benchmark/queries.jsonl`); **labels to be made by the team** with the judging page (pool of 1,542 passages ready) |
| `scifact` | BEIR SciFact (scientific claims → abstracts) | 5,183 | 300 val + 300 test, human qrels |
| `nfcorpus` | BEIR NFCorpus (nutrition questions → medical abstracts) | 3,633 | 300 val + 323 test, graded human qrels |

## Which package does what

| Package | Responsibility | Split owner (§13) |
|---|---|---|
| `contextweave/core/` | shared types, `Retriever` protocol, registry, config, `PassageStore`, timing | team |
| `contextweave/ingestion/` | download, PDF extraction, cleaning, chunking, manifest, BEIR loader | M1 |
| `contextweave/textproc/` | the one shared `normalize()` (tokenise, stop words, Porter) | M1 |
| `contextweave/indexing/` | inverted index, blocked construction + merge, Boolean queries, snippets | M1 |
| `contextweave/lexical/` | TF-IDF, BM25, Champion Lists, Index Elimination, explanations | M2 |
| `contextweave/semantic/` | embedder, FAISS store, dense retriever, embedding-filtered expansion | M3 |
| `contextweave/controller/` | features, router, confidence, budget, fusion, main loop; VoC, risk control, QPP fusion | M4 |
| `contextweave/evaluation/` | metrics, benchmark/pooling, runner, significance, calibration, agreement, plots | M4 |
| `contextweave/system.py` | composition root: the only module importing concrete retrievers; registers them by name | team |
| `app/` | Streamlit main page + one file per panel (lexical, semantic, controller, analytics, judge) | all |
| `experiments/` | `fit_and_tune.py` (validation only), `run_all.py`, `ablations.py`, `systems.py`, `results/` | M4 |

Adding a retriever: implement `name`, `cost`, `search(query, k, candidate_ids)` and `registry.register(...)` it in
`system.py` (or your own module). The controller, UI and experiments pick it up by name.

## Results (test splits, from `experiments/results/tables_*_test.md`)

| | SciFact NDCG@10 | SciFact cost | NFCorpus NDCG@10 | NFCorpus cost |
|---|---|---|---|---|
| S2 BM25 (from scratch) | 0.689 | 1.0 | 0.323 | 1.0 |
| S4 Dense (MiniLM + FAISS) | 0.648 | 24.9 | 0.318 | 59.5 |
| S5 Fixed hybrid | 0.731 | 25.9 | 0.355 | 60.5 |
| **S7 Full controller** | 0.715 | 16.6 (−36%) | 0.340 | 26.9 (−55%) |
| **N4 + QPP-percentile fusion** | 0.722 | 18.6 (−28%) | 0.339 | 26.9 (−55%) |

Cost unit = one full BM25 query on this machine (2-CPU Xeon). Learn-then-Test risk control held on the test split at
every certified risk level (8/8). Published reference (BEIR paper): BM25 0.665 / 0.325. The cs corpus awaits team
labels; its cost profile is 11.4 units per query for the controller vs 24.3 for the hybrid.

## Systems evaluated

S0 Boolean AND · S1 TF-IDF · S2 BM25 · S3 BM25 + Champion + Index Elimination · S4 Dense · S5 Fixed hybrid ·
S6 Routing only · S7 Full controller · S8 S7 + expansion · N1–N4 = S8 + each novel component.
Every number in the report comes from `experiments/results/*.json` (timestamp, hardware and config inside), tables in
`experiments/results/tables_*.md`, figures in `experiments/results/figures/`.

## Labelling the cs benchmark (team task)

1. `make app` → **✅ Judge** tab, enter your name, grade passages 0/1/2 (`benchmark/judging_guidelines.md`).
2. Two people grade the same 16 queries; `python -c "from contextweave.evaluation.agreement import kappa_report; kappa_report()"`.
3. `make eval COLLECTIONS=cs` produces the cs tables and figures for the report.

## Checkpoint log

| Checkpoint | Done when | Status |
|---|---|---|
| C0 Scaffold | contract tests pass | ✅ `tests/test_contracts.py` |
| C1 Corpus | passages.jsonl + stats | ✅ 163 docs, 7,661 passages |
| C2 Lexical | BM25 = rank-bm25 on fixture; CLI search | ✅ `tests/test_lexical.py`, `main.py search` |
| C3 Semantic | semantic example query works | ✅ PageRank/link-analysis passages for the "importance of a webpage" query |
| C4 Controller | trace shows a stop and an escalation | ✅ `tests/test_controller.py` |
| C5 Evaluation | metrics = ir-measures; results + plots saved | ✅ `tests/test_evaluation.py`, `experiments/results/` |
| C6 UI | example queries end to end | ✅ `tests/test_app.py` (headless Streamlit) |

See `docs/ASSUMPTIONS.md` for every interpretation of the spec and every deviation.
