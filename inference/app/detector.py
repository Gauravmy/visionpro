"""YOLO detector wrapper.

Loads Ultralytics weights once at startup. If the weights file or the
``ultralytics`` package is missing, the detector stays unloaded and reports why;
no substitute model is used and no predictions are produced.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol

import numpy as np

from .config import Settings

logger = logging.getLogger("visioninspect.detector")


# Canonical class for everyday objects that are not a supported product (cup, book, keys...).
OUT_OF_RANGE = "out_of_range"


@dataclass(frozen=True)
class Detection:
    class_id: int
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float
    # What the model saw, for out-of-range objects ("cup"); None for products.
    label: str | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "classId": self.class_id,
            "className": self.class_name,
            "confidence": round(self.confidence, 4),
            "box": {
                "x1": round(self.x1, 1),
                "y1": round(self.y1, 1),
                "x2": round(self.x2, 1),
                "y2": round(self.y2, 1),
            },
        }
        if self.label is not None:
            out["label"] = self.label
        return out


@dataclass(frozen=True)
class PredictionResult:
    detections: list[Detection]
    preprocess_ms: float | None
    inference_ms: float | None
    postprocess_ms: float | None
    total_ms: float


class Predictor(Protocol):
    names: dict[int, str]

    def predict(self, image: np.ndarray, conf: float, imgsz: int) -> PredictionResult: ...


def load_vocabulary(path) -> dict[str, str]:
    """Map every model label / text prompt (lower-case) to its canonical class key.

    The file looks like ``{"classes": {"bottle": ["bottle", "plastic bottle"], ...},
    "other_objects": ["cup", ...]}``; other objects map to ``out_of_range``.
    Labels not listed keep their own name, so the decision engine still sees them.
    """
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    mapping: dict[str, str] = {}
    for key, synonyms in (raw.get("classes") or {}).items():
        mapping[str(key).lower()] = str(key)
        for name in synonyms or []:
            mapping[str(name).lower()] = str(key)
    for name in raw.get("other_objects") or []:
        mapping.setdefault(str(name).lower(), OUT_OF_RANGE)
    return mapping


class UltralyticsPredictor:
    def __init__(self, weights: str, vocabulary: dict[str, str] | None = None) -> None:
        # Never let Ultralytics pip-install packages at runtime.
        os.environ.setdefault("YOLO_AUTOINSTALL", "false")
        from ultralytics import YOLO  # imported lazily: optional dependency

        self._model = YOLO(weights)
        self._raw_names = {int(k): str(v) for k, v in self._model.names.items()}
        vocab = vocabulary or {}
        # Several labels can map to one class ("glass bottle" -> "bottle"). With a vocabulary,
        # unlisted labels (person, hand, door...) are background and are dropped.
        self._canonical = {i: vocab.get(n.lower(), n) for i, n in self._raw_names.items() if not vocab or n.lower() in vocab}
        canon = sorted(set(self._canonical.values()))
        self.names = {i: n for i, n in enumerate(canon)}
        self._ids = {n: i for i, n in self.names.items()}
        self._lock = threading.Lock()

    def predict(self, image: np.ndarray, conf: float, imgsz: int) -> PredictionResult:
        started = time.perf_counter()
        with self._lock:
            # Class-agnostic NMS: one label per object even when prompts overlap.
            results = self._model.predict(image, conf=conf, imgsz=imgsz, agnostic_nms=True, verbose=False)
        total_ms = (time.perf_counter() - started) * 1000.0
        result = results[0]
        detections: list[Detection] = []
        boxes = result.boxes
        if boxes is not None and len(boxes) > 0:
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy()
            classes = boxes.cls.cpu().numpy().astype(int)
            for (x1, y1, x2, y2), score, cls in zip(xyxy, confs, classes):
                name = self._canonical.get(int(cls))
                if name is None:
                    continue
                detections.append(
                    Detection(
                        class_id=self._ids.get(name, int(cls)),
                        class_name=name,
                        confidence=float(score),
                        x1=float(x1),
                        y1=float(y1),
                        x2=float(x2),
                        y2=float(y2),
                        label=self._raw_names.get(int(cls)) if name == OUT_OF_RANGE else None,
                    )
                )
        speed = getattr(result, "speed", None) or {}
        return PredictionResult(
            detections=detections,
            preprocess_ms=_maybe_float(speed.get("preprocess")),
            inference_ms=_maybe_float(speed.get("inference")),
            postprocess_ms=_maybe_float(speed.get("postprocess")),
            total_ms=total_ms,
        )


def _maybe_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


@dataclass
class DetectorState:
    model_id: str
    model_version: str
    imgsz: int
    weights_present: bool = False
    loaded: bool = False
    error: str | None = None
    predictor: Predictor | None = None
    loaded_at: str | None = None
    load_ms: float | None = None
    classes: list[str] = field(default_factory=list)

    def status(self) -> dict[str, Any]:
        return {
            "loaded": self.loaded,
            "weightsPresent": self.weights_present,
            "framework": "ultralytics-yolo",
            "modelId": self.model_id,
            "modelVersion": self.model_version,
            "imgsz": self.imgsz,
            "classes": self.classes,
            "loadedAt": self.loaded_at,
            "loadMs": None if self.load_ms is None else round(self.load_ms, 1),
            "error": self.error,
        }


def load_detector(settings: Settings) -> DetectorState:
    state = DetectorState(
        model_id=settings.model_id,
        model_version=settings.model_version,
        imgsz=settings.imgsz,
    )
    state.weights_present = settings.model_path.is_file()
    if not state.weights_present:
        state.error = "Weights file not found. Set VI_MODEL_PATH to trained YOLO weights."
        logger.warning("Detector unavailable: weights not found at %s", settings.model_path)
        return state
    try:
        started = time.perf_counter()
        predictor = UltralyticsPredictor(str(settings.model_path), load_vocabulary(settings.vocab_path))
        state.load_ms = (time.perf_counter() - started) * 1000.0
    except ImportError:
        state.error = "The ultralytics package is not installed (pip install -r requirements-model.txt)."
        logger.warning("Detector unavailable: ultralytics not installed")
        return state
    except Exception:  # noqa: BLE001 - any loader failure leaves the model unavailable
        logger.exception("Failed to load detector weights")
        state.error = "The weights file could not be loaded. See the service log for details."
        return state
    attach_predictor(state, predictor)
    _warm_up(predictor, settings)
    return state


def _warm_up(predictor: Predictor, settings: Settings) -> None:
    """One throwaway inference per input size, so the first real request is not slow (~9 s cold on CPU)."""
    started = time.perf_counter()
    blank = np.full((480, 640, 3), 114, dtype=np.uint8)
    try:
        for size in sorted({settings.imgsz, *settings.warmup_imgsz}):
            predictor.predict(blank, conf=0.5, imgsz=size)
    except Exception:  # noqa: BLE001 - warm-up is best effort
        logger.exception("Detector warm-up failed")
        return
    logger.info("Detector warmed up in %.0f ms", (time.perf_counter() - started) * 1000.0)


def attach_predictor(state: DetectorState, predictor: Predictor) -> None:
    state.predictor = predictor
    state.loaded = True
    state.error = None
    state.classes = [predictor.names[k] for k in sorted(predictor.names)]
    state.loaded_at = datetime.now(timezone.utc).isoformat()
