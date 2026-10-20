"""Image decoding and OpenCV image-quality measurements.

The service reports raw measurements only. Pass/fail thresholds belong to the
product profile and are evaluated by the web application, so the rule that
triggered a warning is always visible to the operator.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import cv2
import numpy as np

JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class InvalidImageError(ValueError):
    """The upload is not a decodable JPEG, PNG or WebP image."""


def sniff_format(data: bytes) -> str | None:
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    if data.startswith(PNG_MAGIC):
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def decode_image(data: bytes) -> np.ndarray:
    """Decode bytes to a BGR image, rejecting unsupported or corrupt files."""
    if sniff_format(data) is None:
        raise InvalidImageError("Unsupported file type. Upload a JPEG, PNG or WebP image.")
    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise InvalidImageError("The image could not be decoded. The file may be corrupt.")
    return image


@dataclass(frozen=True)
class QualityMetrics:
    width: int
    height: int
    aspect_ratio: float
    blur_variance: float
    brightness_mean: float
    contrast_std: float
    underexposed_fraction: float
    overexposed_fraction: float
    processing_ms: float

    def as_dict(self) -> dict[str, float | int]:
        return {
            "width": self.width,
            "height": self.height,
            "aspectRatio": round(self.aspect_ratio, 4),
            "blurVariance": round(self.blur_variance, 2),
            "brightnessMean": round(self.brightness_mean, 2),
            "contrastStd": round(self.contrast_std, 2),
            "underexposedFraction": round(self.underexposed_fraction, 4),
            "overexposedFraction": round(self.overexposed_fraction, 4),
            "processingMs": round(self.processing_ms, 2),
        }


def measure_quality(image: np.ndarray) -> QualityMetrics:
    """Measure focus (variance of the Laplacian) and exposure statistics."""
    started = time.perf_counter()
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    total = float(gray.size)
    metrics = QualityMetrics(
        width=int(width),
        height=int(height),
        aspect_ratio=float(width) / float(height) if height else 0.0,
        blur_variance=blur_variance,
        brightness_mean=float(gray.mean()),
        contrast_std=float(gray.std()),
        underexposed_fraction=float(np.count_nonzero(gray <= 10)) / total,
        overexposed_fraction=float(np.count_nonzero(gray >= 245)) / total,
        processing_ms=(time.perf_counter() - started) * 1000.0,
    )
    return metrics
