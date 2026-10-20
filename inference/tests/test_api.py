"""API tests. A stub predictor stands in for YOLO weights so the request and
response contract can be verified without a trained model."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.detector import Detection, DetectorState, PredictionResult, attach_predictor
from app.main import create_app


def _png(image: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", image)
    assert ok
    return buf.tobytes()


def _textured(width: int = 320, height: int = 240) -> np.ndarray:
    rng = np.random.default_rng(0)
    return rng.integers(0, 255, size=(height, width, 3), dtype=np.uint8)


class StubPredictor:
    names = {0: "crazing", 1: "scratches"}

    def __init__(self, detections: list[Detection], fail: bool = False) -> None:
        self._detections = detections
        self._fail = fail

    def predict(self, image, conf, imgsz):
        if self._fail:
            raise RuntimeError("boom")
        kept = [d for d in self._detections if d.confidence >= conf]
        return PredictionResult(kept, 1.0, 5.0, 0.5, 7.0)


def _settings(tmp_path: Path) -> Settings:
    return Settings(model_path=tmp_path / "missing.pt", max_upload_bytes=1024 * 1024)


def _client(tmp_path: Path, predictor=None) -> TestClient:
    settings = _settings(tmp_path)
    state = DetectorState(model_id="test-model", model_version="t1", imgsz=640)
    if predictor is not None:
        attach_predictor(state, predictor)
    else:
        state.error = "Weights file not found."
    return TestClient(create_app(settings, detector=state))


def test_health_reports_unloaded_model(tmp_path):
    with _client(tmp_path) as client:
        body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["quality"]["available"] is True
    assert body["model"]["loaded"] is False
    assert "/" not in (body["model"]["error"] or "") or "VI_MODEL_PATH" in body["model"]["error"]


def test_quality_metrics_for_valid_image(tmp_path):
    with _client(tmp_path) as client:
        resp = client.post("/api/quality", files={"image": ("a.png", _png(_textured()), "image/png")})
    assert resp.status_code == 200
    q = resp.json()["quality"]
    assert q["width"] == 320 and q["height"] == 240
    assert q["blurVariance"] > 100


def test_blurred_image_has_lower_focus_measure(tmp_path):
    sharp = _textured()
    blurred = cv2.GaussianBlur(sharp, (21, 21), 8)
    with _client(tmp_path) as client:
        a = client.post("/api/quality", files={"image": ("a.png", _png(sharp), "image/png")}).json()
        b = client.post("/api/quality", files={"image": ("b.png", _png(blurred), "image/png")}).json()
    assert b["quality"]["blurVariance"] < a["quality"]["blurVariance"] / 10


def test_rejects_non_image(tmp_path):
    with _client(tmp_path) as client:
        resp = client.post("/api/quality", files={"image": ("a.png", b"not an image", "image/png")})
    assert resp.status_code == 415
    assert resp.json()["error"]["code"] == "INVALID_IMAGE"


def test_rejects_empty_and_oversized(tmp_path):
    with _client(tmp_path) as client:
        empty = client.post("/api/quality", files={"image": ("a.png", b"", "image/png")})
        big = client.post("/api/quality", files={"image": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * (2 * 1024 * 1024), "image/png")})
    assert empty.status_code == 400
    assert big.status_code == 413


def test_predict_unavailable_returns_503(tmp_path):
    with _client(tmp_path) as client:
        resp = client.post("/api/predict", files={"image": ("a.png", _png(_textured()), "image/png")})
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "MODEL_UNAVAILABLE"


def test_analyze_without_model_reports_unavailable_and_no_detections(tmp_path):
    with _client(tmp_path) as client:
        resp = client.post("/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")})
    body = resp.json()
    assert resp.status_code == 200
    assert body["detection"]["status"] == "unavailable"
    assert "detections" not in body["detection"]
    assert body["quality"]["status"] == "ok"


def test_analyze_with_predictor_returns_structured_detections(tmp_path):
    dets = [
        Detection(1, "scratches", 0.81, 10, 20, 110, 60),
        Detection(0, "crazing", 0.12, 0, 0, 5, 5),
    ]
    with _client(tmp_path, StubPredictor(dets)) as client:
        resp = client.post(
            "/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")}, data={"conf": "0.2"}
        )
    body = resp.json()
    assert body["detection"]["status"] == "ok"
    assert body["detection"]["modelId"] == "test-model"
    assert len(body["detection"]["detections"]) == 1
    det = body["detection"]["detections"][0]
    assert det["className"] == "scratches"
    assert det["box"] == {"x1": 10.0, "y1": 20.0, "x2": 110.0, "y2": 60.0}
    assert body["detection"]["timings"]["inferenceMs"] == 5.0


def test_analyze_empty_prediction(tmp_path):
    with _client(tmp_path, StubPredictor([])) as client:
        body = client.post("/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")}).json()
    assert body["detection"]["status"] == "ok"
    assert body["detection"]["detections"] == []


def test_inference_failure_is_reported_without_traceback(tmp_path):
    with _client(tmp_path, StubPredictor([], fail=True)) as client:
        body = client.post("/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")}).json()
    assert body["detection"]["status"] == "error"
    assert "Traceback" not in body["detection"]["message"]


@pytest.mark.parametrize("conf", ["0", "1.5", "-1"])
def test_invalid_conf(tmp_path, conf):
    with _client(tmp_path) as client:
        resp = client.post(
            "/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")}, data={"conf": conf}
        )
    assert resp.status_code == 422


class ZoomStub:
    """Finds nothing on the original image, one box on the padded (larger) image."""

    names = {0: "bottle"}

    def __init__(self) -> None:
        self.calls: list[tuple[int, int]] = []

    def predict(self, image, conf, imgsz):
        h, w = image.shape[:2]
        self.calls.append((w, h))
        if len(self.calls) == 1:
            return PredictionResult([], 1.0, 5.0, 0.5, 7.0)
        # Padded by 60% each side: the original 320x240 image sits at (192, 144).
        return PredictionResult([Detection(0, "bottle", 0.7, 202.0, 154.0, 302.0, 354.0)], 1.0, 5.0, 0.5, 7.0)


def test_analyze_retries_zoomed_out_and_maps_boxes_back(tmp_path):
    stub = ZoomStub()
    with _client(tmp_path, stub) as client:
        body = client.post("/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")}).json()
    assert stub.calls == [(320, 240), (704, 528)]
    (det,) = body["detection"]["detections"]
    assert det["className"] == "bottle"
    assert det["box"] == {"x1": 10.0, "y1": 10.0, "x2": 110.0, "y2": 210.0}
    assert body["detection"]["timings"]["inferenceMs"] == 10.0


class SizeStub(StubPredictor):
    def __init__(self) -> None:
        super().__init__([])
        self.sizes: list[int] = []

    def predict(self, image, conf, imgsz):
        self.sizes.append(imgsz)
        return super().predict(image, conf, imgsz)


def test_analyze_uses_requested_imgsz(tmp_path):
    stub = SizeStub()
    files = {"image": ("a.png", _png(_textured()), "image/png")}
    with _client(tmp_path, stub) as client:
        live = client.post("/api/analyze", files=files, data={"imgsz": "480", "thorough": "false"}).json()
        default = client.post("/api/analyze", files=files, data={"thorough": "false"}).json()
        bad = client.post("/api/analyze", files=files, data={"imgsz": "500"})
    assert stub.sizes == [480, 640]
    assert live["detection"]["imgsz"] == 480 and default["detection"]["imgsz"] == 640
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_IMGSZ"


def test_analyze_skips_zoom_out_when_not_thorough(tmp_path):
    stub = ZoomStub()
    with _client(tmp_path, stub) as client:
        body = client.post("/api/analyze", files={"image": ("a.png", _png(_textured()), "image/png")}, data={"thorough": "false"}).json()
    assert len(stub.calls) == 1
    assert body["detection"]["detections"] == []


def test_api_token_is_required_when_configured(tmp_path):
    settings = Settings(model_path=tmp_path / "missing.pt", max_upload_bytes=1024 * 1024, api_token="s3cret-token")
    state = DetectorState(model_id="test-model", model_version="t1", imgsz=640)
    with TestClient(create_app(settings, detector=state)) as client:
        assert client.get("/health").status_code == 401
        wrong = client.get("/health", headers={"Authorization": "Bearer nope"})
        assert wrong.status_code == 401 and wrong.json()["error"]["code"] == "UNAUTHORIZED"
        assert client.get("/health", headers={"Authorization": "Bearer s3cret-token"}).status_code == 200
