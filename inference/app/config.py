"""Service configuration read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _resolve(raw: str) -> Path:
    path = Path(raw)
    if path.is_absolute():
        return path
    # Accept paths relative to the repo root ("inference/weights/...") or to this service.
    for base in (SERVICE_ROOT, SERVICE_ROOT.parent):
        candidate = (base / path).resolve()
        if candidate.exists():
            return candidate
    return (SERVICE_ROOT / path).resolve()


def _model_path() -> Path:
    return _resolve(os.environ.get("VI_MODEL_PATH", "weights/qc-yoloe.pt"))


def _vocab_path() -> Path:
    return _resolve(os.environ.get("VI_VOCAB_PATH", "weights/vocabulary.json"))


@dataclass(frozen=True)
class Settings:
    model_path: Path = field(default_factory=_model_path)
    vocab_path: Path = field(default_factory=_vocab_path)
    model_id: str = field(default_factory=lambda: os.environ.get("VI_MODEL_ID", "yoloe-qc"))
    model_version: str = field(default_factory=lambda: os.environ.get("VI_MODEL_VERSION", "11l-text-vp-v2"))
    imgsz: int = field(default_factory=lambda: _int("VI_IMGSZ", 640))
    # Extra input sizes warmed up at start (the web app's live preview requests 480).
    warmup_imgsz: tuple[int, ...] = field(
        default_factory=lambda: tuple(
            int(s) for s in os.environ.get("VI_WARMUP_IMGSZ", "480").split(",") if s.strip().isdigit()
        )
    )
    max_upload_bytes: int = field(default_factory=lambda: _int("VI_MAX_UPLOAD_MB", 10) * 1024 * 1024)
    # Shared secret. When set, every request needs "Authorization: Bearer <token>"
    # (use it whenever the service is reachable from outside this machine, e.g. through a tunnel).
    api_token: str | None = field(default_factory=lambda: os.environ.get("VI_API_TOKEN", "").strip() or None)
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip() for o in os.environ.get("VI_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
        )
    )


def get_settings() -> Settings:
    return Settings()
