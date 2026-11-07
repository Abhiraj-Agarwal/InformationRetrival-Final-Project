"""Sentence-Transformers embedder (fixed all-MiniLM-L6-v2, no training), CPU only."""
from __future__ import annotations

import logging
from typing import Optional, Sequence

import numpy as np

from contextweave.core.types import Query

log = logging.getLogger(__name__)


class Embedder:
    """Lazy-loading wrapper. All vectors are L2-normalised float32, so inner product = cosine."""

    def __init__(self, model_name: str, batch_size: int = 64, max_seq_length: int = 256):
        self.model_name, self.batch_size, self.max_seq_length = model_name, batch_size, max_seq_length
        self._model = None
        self._term_cache: dict[str, np.ndarray] = {}

    @property
    def model(self):
        if self._model is None:
            import torch
            from sentence_transformers import SentenceTransformer

            torch.set_num_threads(max(1, torch.get_num_threads()))
            self._model = SentenceTransformer(self.model_name, device="cpu")
            self._model.max_seq_length = self.max_seq_length
            log.info("loaded %s", self.model_name)
        return self._model

    @property
    def dim(self) -> int:
        return int(self.model.get_sentence_embedding_dimension())

    def encode(self, texts: Sequence[str], show_progress: bool = False) -> np.ndarray:
        vecs = self.model.encode(list(texts), batch_size=self.batch_size, normalize_embeddings=True,
                                 convert_to_numpy=True, show_progress_bar=show_progress)
        return vecs.astype(np.float32)

    def encode_query(self, query: Query) -> np.ndarray:
        """Query vector, computed once per Query object and cached on it."""
        v = query.cache.get("qvec")
        if v is None:
            v = self.encode([query.raw])[0]
            query.cache["qvec"] = v
        return v

    def encode_terms(self, terms: Sequence[str]) -> np.ndarray:
        """Embeddings of single words (used by query expansion), cached across queries."""
        missing = [t for t in terms if t not in self._term_cache]
        if missing:
            for t, v in zip(missing, self.encode(missing)):
                self._term_cache[t] = v
        return np.stack([self._term_cache[t] for t in terms]) if terms else np.zeros((0, 1), np.float32)

    def similarity(self, query: Query, texts: Sequence[str]) -> Optional[np.ndarray]:
        if not texts:
            return None
        return self.encode(texts) @ self.encode_query(query)
