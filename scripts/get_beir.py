"""Download the BEIR SciFact and NFCorpus test collections (human relevance judgements)."""
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "external"
URL = "https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/{}.zip"

for name in sys.argv[1:] or ["scifact", "nfcorpus"]:
    if (DEST / name / "corpus.jsonl").exists():
        print(f"{name}: already present")
        continue
    DEST.mkdir(parents=True, exist_ok=True)
    print(f"downloading {name} …")
    data = urllib.request.urlopen(URL.format(name), timeout=300).read()  # noqa: S310
    zipfile.ZipFile(io.BytesIO(data)).extractall(DEST)
    print(f"{name}: ok")
