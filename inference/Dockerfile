# VisionInspect inference service: FastAPI + OpenCV + Ultralytics YOLOE (CPU).
# Build context: the inference/ directory. Needs weights/qc-yoloe.pt (Git LFS: run `git lfs pull` first).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_AUTOINSTALL=false \
    YOLO_OFFLINE=1 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics \
    VI_MODEL_PATH=weights/qc-yoloe.pt \
    VI_VOCAB_PATH=weights/vocabulary.json

# ultralytics pulls in opencv-python, which needs these shared libraries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt "ultralytics>=8.4"

COPY app ./app
COPY weights/qc-yoloe.pt weights/vocabulary.json ./weights/
# Fail the build early if the weights are a Git LFS pointer instead of the real file.
RUN python -c "import os,sys; s=os.path.getsize('weights/qc-yoloe.pt'); sys.exit(0 if s > 1_000_000 else 'weights/qc-yoloe.pt is a Git LFS pointer (%d bytes): run git lfs pull before building' % s)"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
