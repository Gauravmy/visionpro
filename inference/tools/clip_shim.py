"""Provide the `clip.clip.tokenize` function Ultralytics' text encoders import.

Ultralytics imports the `clip` package (its GitHub fork of OpenAI CLIP) only for the
BPE tokenizer and, if it is missing, tries to pip-install it from GitHub at runtime.
`open_clip_torch` (PyPI) ships the identical OpenAI CLIP tokenizer, so this registers a
small `clip` module backed by it before Ultralytics is imported.
"""

from __future__ import annotations

import sys
import types


def install() -> None:
    try:
        import clip  # noqa: F401  (the real package is fine too)

        return
    except ImportError:
        pass
    import open_clip

    def tokenize(texts, context_length: int = 77, truncate: bool = True):
        if isinstance(texts, str):
            texts = [texts]
        return open_clip.tokenize(list(texts), context_length=context_length)

    inner = types.ModuleType("clip.clip")
    inner.tokenize = tokenize
    outer = types.ModuleType("clip")
    outer.clip = inner
    outer.tokenize = tokenize
    sys.modules["clip"] = outer
    sys.modules["clip.clip"] = inner
