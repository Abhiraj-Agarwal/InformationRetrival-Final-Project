"""ContextWeave command line.

    python main.py data                      # extract, clean, chunk -> passages.jsonl
    python main.py build-index [--collection cs] [--no-semantic]
    python main.py search "query" [--mode auto|bm25|tfidf|dense|hybrid|boolean|...] [--k 10]
    python main.py evaluate [--split val|test] [--systems S2,S7] [--collection cs]
    python main.py calibrate-costs [--collection cs]
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

from contextweave.core.config import load_config


def _cmd_data(args, cfg):
    from contextweave.ingestion.beir import convert
    from contextweave.ingestion.download import download_all
    from contextweave.ingestion.manifest import build_corpus
    from pathlib import Path

    if args.download:
        download_all(Path("data/sources.csv"), Path(cfg["paths"]["raw"]))
    stats = build_corpus(cfg)
    print(json.dumps(stats, indent=2))
    ext = Path(cfg["paths"]["external"])
    for name in ("scifact", "nfcorpus"):
        if (ext / name / "corpus.jsonl").exists():
            print(convert(name, ext, Path(cfg["paths"]["processed"]), Path(cfg["paths"]["benchmark"])))


def _cmd_build_index(args, cfg):
    from contextweave.system import build_lexical_index, load_system

    for c in args.collection.split(","):
        build_lexical_index(cfg, c)
        if not args.no_semantic:
            load_system(cfg, collection=c, semantic=True)  # builds embeddings + FAISS if missing
        print(f"indexes ready for {c}")


def _cmd_search(args, cfg):
    from contextweave.system import load_system

    system = load_system(cfg, collection=args.collection, semantic=args.mode not in
                         {"bm25", "tfidf", "boolean", "bm25_champion", "bm25_ie"})
    engine = system.engine()
    resp = engine.search(args.query, mode=args.mode, k=args.k)
    print(f"mode={resp.mode} cost={resp.total_cost:.2f} latency={resp.total_latency_ms:.1f}ms terms={resp.query.terms}")
    for st in resp.trace:
        conf = "" if st.confidence is None else f" conf={st.confidence:.2f}"
        print(f"  [{st.action:10s}] {st.method or '':14s} cost={st.cost:.2f} left={st.budget_left:.2f}{conf} {st.note}")
    from contextweave.lexical.explain import format_explanation

    for r in resp.results:
        p = system.store[r.passage_id]
        print(f"{r.rank:2d}. {r.score:.4f} [{r.method}] {p.title[:70]} (p.{p.page})")
        if "terms" in r.explanation or "lexical" in r.explanation:
            print("     ", format_explanation(r)[:150])


def _cmd_evaluate(args, cfg):
    from experiments.run_all import run_systems

    out = run_systems(cfg, collection=args.collection, split=args.split,
                      systems=args.systems.split(",") if args.systems else None)
    print(out)


def _cmd_calibrate(args, cfg):
    from contextweave.evaluation.calibrate import calibrate_costs

    print(json.dumps(calibrate_costs(cfg, collection=args.collection, write=not args.dry_run), indent=2))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="contextweave")
    ap.add_argument("--config", default=None)
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("data")
    d.add_argument("--download", action="store_true", help="download sources first")
    b = sub.add_parser("build-index")
    b.add_argument("--collection", default=None)
    b.add_argument("--no-semantic", action="store_true")
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--mode", default="auto")
    s.add_argument("--k", type=int, default=10)
    s.add_argument("--collection", default=None)
    e = sub.add_parser("evaluate")
    e.add_argument("--split", default="val")
    e.add_argument("--systems", default=None)
    e.add_argument("--collection", default=None)
    c = sub.add_parser("calibrate-costs")
    c.add_argument("--collection", default=None)
    c.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(args.config)
    if getattr(args, "collection", None) is None and args.cmd != "data":
        args.collection = cfg["collection"]
    {"data": _cmd_data, "build-index": _cmd_build_index, "search": _cmd_search, "evaluate": _cmd_evaluate,
     "calibrate-costs": _cmd_calibrate}[args.cmd](args, cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
