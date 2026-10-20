"""VisionInspect Pro inference service.

Endpoints
---------
GET  /health        Service, OpenCV and detector status (checks whether weights are loaded).
POST /api/quality   OpenCV image-quality measurements for one image.
POST /api/predict   YOLO detections for one image (503 when the detector is unavailable).
POST /api/analyze   Quality measurements and detector output in one call (optional imgsz field).

All POST endpoints accept ``multipart/form-data`` with an ``image`` file field.
Errors use the shape ``{"error": {"code": str, "message": str}}``; internal
paths and tracebacks are never returned to clients.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any

import cv2
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .detector import OUT_OF_RANGE, Detection, DetectorState, PredictionResult, load_detector
from .quality import InvalidImageError, decode_image, measure_quality, sniff_format

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("visioninspect.api")

SERVICE_VERSION = "0.1.0"


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def create_app(settings: Settings | None = None, detector: DetectorState | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.detector = detector if detector is not None else load_detector(settings)
        yield

    app = FastAPI(title="VisionInspect Pro Inference", version=SERVICE_VERSION, lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = sorted({".".join(str(p) for p in err.get("loc", [])[1:]) for err in exc.errors()})
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "INVALID_REQUEST", "message": f"Invalid or missing fields: {', '.join(fields)}"}},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "Internal inference error."}}
        )

    def _state(request: Request) -> DetectorState:
        return request.app.state.detector

    async def _read_upload(image: UploadFile) -> bytes:
        limit = settings.max_upload_bytes
        data = await image.read(limit + 1)
        if len(data) == 0:
            raise ApiError(400, "EMPTY_FILE", "The uploaded file is empty.")
        if len(data) > limit:
            raise ApiError(413, "FILE_TOO_LARGE", f"Image exceeds the {limit // (1024 * 1024)} MB limit.")
        return data

    def _decode(data: bytes):
        try:
            return decode_image(data)
        except InvalidImageError as exc:
            raise ApiError(415, "INVALID_IMAGE", str(exc)) from exc

    def _validate_conf(conf: float) -> float:
        if not 0.0 < conf <= 1.0:
            raise ApiError(422, "INVALID_CONFIDENCE", "conf must be greater than 0 and at most 1.")
        return conf

    def _validate_imgsz(imgsz: int | None) -> int | None:
        if imgsz is not None and not (MIN_IMGSZ <= imgsz <= MAX_IMGSZ and imgsz % 32 == 0):
            raise ApiError(422, "INVALID_IMGSZ", f"imgsz must be a multiple of 32 between {MIN_IMGSZ} and {MAX_IMGSZ}.")
        return imgsz

    def _run_detector(
        state: DetectorState, image, conf: float, thorough: bool = False, imgsz: int | None = None
    ) -> dict[str, Any]:
        if not state.loaded or state.predictor is None:
            return {"status": "unavailable", "message": state.error or "Detector not loaded.", **_model_meta(state)}
        size = imgsz or state.imgsz
        try:
            result = state.predictor.predict(image, conf=conf, imgsz=size)
            if thorough and not any(d.confidence >= ZOOM_OUT_BELOW and d.class_name != OUT_OF_RANGE for d in result.detections):
                result = _with_zoom_out(state, image, conf, result, size)
        except Exception:  # noqa: BLE001
            logger.exception("Inference failed")
            return {"status": "error", "message": "Inference failed. See the service log.", **_model_meta(state)}
        return {
            "status": "ok",
            "message": None,
            **_model_meta(state),
            "confThreshold": conf,
            "imgsz": size,
            "detections": [d.as_dict() for d in result.detections],
            "timings": {
                "preprocessMs": _round(result.preprocess_ms),
                "inferenceMs": _round(result.inference_ms),
                "postprocessMs": _round(result.postprocess_ms),
                "totalMs": _round(result.total_ms),
            },
        }

    @app.get("/health")
    async def health(request: Request) -> dict[str, Any]:
        state = _state(request)
        return {
            "status": "ok",
            "service": "visioninspect-inference",
            "version": SERVICE_VERSION,
            "quality": {"available": True, "opencvVersion": cv2.__version__},
            "model": state.status(),
        }

    @app.post("/api/quality")
    async def quality(image: UploadFile = File(...)) -> dict[str, Any]:
        data = await _read_upload(image)
        decoded = _decode(data)
        return {"format": sniff_format(data), "quality": measure_quality(decoded).as_dict()}

    @app.post("/api/predict")
    async def predict(request: Request, image: UploadFile = File(...), conf: float = Form(0.25)) -> dict[str, Any]:
        conf = _validate_conf(conf)
        state = _state(request)
        if not state.loaded:
            raise ApiError(503, "MODEL_UNAVAILABLE", state.error or "Detector not loaded.")
        data = await _read_upload(image)
        decoded = _decode(data)
        height, width = decoded.shape[:2]
        result = _run_detector(state, decoded, conf)
        if result["status"] != "ok":
            raise ApiError(500, "INFERENCE_FAILED", result["message"])
        return {"image": {"width": width, "height": height}, **result}

    @app.post("/api/analyze")
    async def analyze(
        request: Request,
        image: UploadFile = File(...),
        conf: float = Form(0.25),
        thorough: bool = Form(True),
        imgsz: int | None = Form(None),
    ) -> dict[str, Any]:
        started = time.perf_counter()
        conf = _validate_conf(conf)
        imgsz = _validate_imgsz(imgsz)
        data = await _read_upload(image)
        decode_started = time.perf_counter()
        decoded = _decode(data)
        decode_ms = (time.perf_counter() - decode_started) * 1000.0
        height, width = decoded.shape[:2]
        quality_metrics = measure_quality(decoded).as_dict()
        detection = _run_detector(_state(request), decoded, conf, thorough, imgsz)
        return {
            "image": {"width": width, "height": height, "format": sniff_format(data)},
            "quality": {"status": "ok", "metrics": quality_metrics},
            "detection": detection,
            "timings": {"decodeMs": _round(decode_ms), "serviceTotalMs": _round((time.perf_counter() - started) * 1000.0)},
        }

    return app


# Second, zoomed-out pass for stored inspections when the first pass found nothing confident.
# Objects that fill the frame or touch its edges (close-ups, tightly cropped web photos) are
# often missed; padding the image so the object sits inside the frame recovers them.
ZOOM_OUT_BELOW = 0.35
ZOOM_OUT_PAD = 0.6

# Per-request model input size: live preview asks for a smaller one (~1.7x faster on CPU).
MIN_IMGSZ = 160
MAX_IMGSZ = 1280


def _with_zoom_out(state: DetectorState, image, conf: float, first: PredictionResult, imgsz: int) -> PredictionResult:
    h, w = image.shape[:2]
    py, px = int(h * ZOOM_OUT_PAD), int(w * ZOOM_OUT_PAD)
    padded = cv2.copyMakeBorder(image, py, py, px, px, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    second = state.predictor.predict(padded, conf=conf, imgsz=imgsz)
    shifted = [
        Detection(
            class_id=d.class_id,
            class_name=d.class_name,
            confidence=d.confidence,
            x1=min(max(d.x1 - px, 0.0), w),
            y1=min(max(d.y1 - py, 0.0), h),
            x2=min(max(d.x2 - px, 0.0), w),
            y2=min(max(d.y2 - py, 0.0), h),
            label=d.label,
        )
        for d in second.detections
        if d.x2 - px > 0 and d.y2 - py > 0 and d.x1 - px < w and d.y1 - py < h
    ]
    merged = _dedupe(first.detections + shifted)

    def add(a: float | None, b: float | None) -> float | None:
        return None if a is None and b is None else (a or 0.0) + (b or 0.0)

    return PredictionResult(
        detections=merged,
        preprocess_ms=add(first.preprocess_ms, second.preprocess_ms),
        inference_ms=add(first.inference_ms, second.inference_ms),
        postprocess_ms=add(first.postprocess_ms, second.postprocess_ms),
        total_ms=first.total_ms + second.total_ms,
    )


def _iou(a: Detection, b: Detection) -> float:
    ix = max(0.0, min(a.x2, b.x2) - max(a.x1, b.x1))
    iy = max(0.0, min(a.y2, b.y2) - max(a.y1, b.y1))
    inter = ix * iy
    union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter
    return inter / union if union > 0 else 0.0


def _dedupe(dets: list[Detection], iou: float = 0.6) -> list[Detection]:
    kept: list[Detection] = []
    for d in sorted(dets, key=lambda x: -x.confidence):
        if all(_iou(d, k) < iou for k in kept):
            kept.append(d)
    return kept


def _model_meta(state: DetectorState) -> dict[str, Any]:
    return {"modelId": state.model_id, "modelVersion": state.model_version, "classes": state.classes}


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


app = create_app()
