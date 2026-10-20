# VisionInspect Pro

Explainable AI for industrial quality inspection. Upload or capture an image of a
manufactured part, run OpenCV image-quality checks and a YOLO defect detector, and
get a PASS / REJECT / REVIEW decision with the evidence and the rule behind it.
Results are stored, searchable, exportable and printable.

Three product profiles ship ready to use: **Bottle**, **Charger** and **Marker**. A part
passes when the expected product is in frame, no other product is beside it, a charger shows
no burn mark, and the photo is sharp and well exposed. Inspect an uploaded photo, or point a
camera at the item for a **live check** on every frame (not stored) and capture to save a record.
A legacy **steel surface (NEU-DET)** profile is kept for trained NEU-DET weights.

> **Model status.** The detector is `inference/weights/qc-yoloe.pt`, an Ultralytics **YOLOE-11l**
> model prompted with text ("stainless steel water bottle", "mobile phone charger", "marker pen", ...)
> and with boxes on 15 reference photos; no training run. On 24 labelled photos (including 9 of the
> owner's own webcam captures and uploads: steel, plastic and clear bottles, a mobile charger) 20 were
> decided correctly under all three profiles. It is a starting point, not a validated inspection
> system: add photos of your own items and rebuild (see [The QC detector](#the-qc-detector)).
> The weights are stored with Git LFS (`git lfs pull` after cloning).

---

## Architecture

```
Browser ──► Next.js 15 (App Router, TypeScript)          FastAPI inference service (Python)
            ├─ UI pages (server + client components)      ├─ GET  /health
            ├─ API routes  /api/*  ──── HTTP ────────────► ├─ POST /api/analyze  (quality + detection)
            ├─ Decision engine (src/lib/decision)          ├─ POST /api/quality
            ├─ SQLite (better-sqlite3)  data/*.sqlite3     └─ POST /api/predict
            └─ Image files              data/images/       OpenCV  ·  Ultralytics YOLO (optional)
```

- The browser only talks to the Next.js server. The inference URL is server-side
  configuration and is never needed by the browser.
- The inference service returns **raw measurements and detections**. Pass/fail thresholds
  live in the product profile and are evaluated by the decision engine in TypeScript, so
  every decision cites the configured rule that produced it.
- Inspection records store a snapshot of the profile they were inspected with, so later
  profile edits do not rewrite history.

| Path | Purpose |
| --- | --- |
| `src/app/*` | Pages: dashboard, inspection, inspection/[id], history, analytics, models, products, reports, settings |
| `src/app/api/*` | REST endpoints (see [API](#web-api)) |
| `src/lib/decision/engine.ts` | Decision policy (unit-tested) |
| `src/lib/db/*` | SQLite schema, migrations and repositories |
| `src/lib/inference/*` | Inference client and response validation (zod) |
| `src/lib/services/*` | Inspection orchestration, image retention |
| `src/components/*` | UI components (shell, viewer, charts, forms) |
| `inference/app/*` | FastAPI service: OpenCV quality metrics, YOLO wrapper |

## Requirements

- Node.js 20.9+ (tested with 22.19) and npm
- Python 3.10+ (tested with 3.11) for the inference service
- Optional, for real detection: `ultralytics` (pulls in PyTorch) and trained YOLO weights

## Setup

```bash
git lfs install                   # once per machine: the detector weights are stored with Git LFS
git clone https://github.com/Gauravmy/visionpro.git && cd visionpro
git lfs pull                      # fetches inference/weights/qc-yoloe.pt (~71 MB)
npm ci --ignore-scripts && npm rebuild esbuild unrs-resolver
cp .env.example .env.local        # edit values as needed
```

`--ignore-scripts` uses the prebuilt `better-sqlite3` binary instead of npm's implicit
`node-gyp` build (which needs Visual Studio C++ tools on Windows); the rebuild runs the only
install scripts the project needs.

Inference service (separate virtual environment):

```bash
cd inference
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt          # FastAPI, OpenCV, pytest
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-model.txt        # ultralytics, open_clip_torch (tokenizer)
```

`weights/qc-yoloe.pt` comes from Git LFS, so nothing else is needed to run. Only to **rebuild**
it (after changing `references/`) do you need the base model; Ultralytics also downloads the
MobileCLIP text encoder (`mobileclip_blt.ts`, ~570 MB) into `inference/` on the first rebuild.
Neither file is committed (both are re-downloadable) and neither is needed at runtime.

```bash
python -c "from ultralytics import YOLOE; YOLOE('yoloe-11l-seg.pt')" && move yoloe-11l-seg.pt weights\   # mv on macOS/Linux
python -m tools.build_qc_model               # writes weights/qc-yoloe.pt
```

### Database

SQLite is created automatically on first request at `$VI_DATA_DIR/visioninspect.sqlite3`
(default `./data`). Migrations are versioned in `src/lib/db/index.ts` (`PRAGMA user_version`)
and run at startup. A default "Hot-rolled steel strip" profile with the six NEU-DET classes is
seeded into an empty database, and the Bottle, Charger and Marker profiles are added once
(Bottle becomes the active profile). Images are stored as files under `$VI_DATA_DIR/images/YYYY/MM/`,
never as base64 in the database. To reset everything, stop the server and delete the data
directory.

## Running

Two processes, in separate terminals:

```bash
npm run inference
```

```bash
npm run dev
```

Open http://localhost:3000. For a production build: `npm run build` then `npm run start`.

`npm run inference` starts `uvicorn` from `inference/.venv` on `127.0.0.1:8000` and reads
`VI_*` variables from `.env` / `.env.local`.

## The QC detector

`inference/tools/build_qc_model.py` reads `inference/weights/references/references.json` and
gives YOLOE one output class per **text prompt** (several per product, covering plastic, clear,
glass and steel bottles, mobile wall chargers, markers and highlighters), one per **reference photo**
(a box drawn on a real item; this is how the owner's own charger is recognised) and one per
**distractor** (person, face, hand, door, laptop, ...), which absorbs everyday objects so they are not
forced into a product class. It writes `inference/weights/vocabulary.json`, mapping every output class
to `bottle`, `charger`, `marker` or `burn_mark`; the service drops everything else. Text prompts need
the CLIP tokenizer, which `inference/tools/clip_shim.py` takes from `open_clip_torch` (PyPI).

Stored inspections (uploads and captures) get a second, zoomed-out pass when the first finds no
confident product: tightly cropped or close-up photos are padded so the item sits inside the frame.
Live preview skips it to stay fast.

To improve detection for your own products: photograph each item 2–5 times with the camera
you inspect with, add the files to `inference/weights/references/`, add an entry with the
item's box (`x1, y1, x2, y2` in pixels) to `references.json`, run
`python -m tools.build_qc_model` from `inference/` (`--base yoloe-11s-seg.pt` builds a ~4x faster,
less accurate model), and restart the inference service.

The service sets `YOLO_AUTOINSTALL=false`, so Ultralytics never installs packages at runtime.

### Live camera

Choose **Live camera** on the Inspect page. Frames are downscaled to 640 px and sent to
`POST /api/inspections/preview`, which runs the same analysis and decision as a stored
inspection but stores nothing. Boxes and the decision are drawn over the video; on a CPU
expect roughly one result per second. **Capture & inspect** sends a full-resolution frame
through the normal stored inspection. Browsers allow cameras only on `localhost` or https.

## Adding trained weights

1. Train or obtain an Ultralytics YOLO model for your product (for NEU-DET, class names such
   as `crazing`, `inclusion`, `patches`, `pitted_surface`, `rolled-in_scale`, `scratches`;
   names are normalised, so `rolled-in_scale` matches `rolled_in_scale`).
2. Install `pip install -r inference/requirements-model.txt`.
3. Place the `.pt` file at `inference/weights/neu-det-yolov8n.pt` or set `VI_MODEL_PATH`.
4. Set `VI_MODEL_ID` to the identifier used by the product profile (default
   `yolov8n-neu-det`) and `VI_MODEL_VERSION` to something traceable (e.g. a run name or hash).
5. Restart the inference service. **Models & Performance** shows whether the weights loaded,
   the class names read from them, and whether each profile is compatible.

If the running model ID differs from a profile's model ID, results go to REVIEW
(`MODEL_MISMATCH`). Classes detected by the model that the profile does not configure go
to REVIEW (`UNKNOWN_CLASS`).

## Demo mode vs real inference

There is **no simulated detector** in the app. Without weights the detector is reported as
unavailable and no boxes are drawn. Real OpenCV quality measurements are still computed.

For automated tests only, `inference/tests` and `src/app/api/api.test.ts` use a stub
predictor / mocked service to verify the request and response contract. Those stubs are
never wired into the running application.

## Decision policy

Implemented in `src/lib/decision/engine.ts`. Precedence: **REJECT > REVIEW > PASS**; every
applicable reason is recorded.

| Outcome | When |
| --- | --- |
| REJECT | An enabled defect class is detected with score ≥ its reject threshold · a **required product** class is not found |
| REVIEW | Required product only weakly detected (between its two thresholds) · detector unavailable or failed · running model ≠ profile model · score in the review band (review ≤ score < reject) · class not in the profile · an image-quality rule fails · quality checks enabled but unavailable · automatic PASS disabled for the profile |
| PASS | Detector ran, all enabled checks completed, nothing above triggered |

- Detector scores are raw model confidences. They are **not calibrated probabilities**.
- The service is called with a confidence floor equal to the lowest enabled review threshold,
  so no actionable box is dropped.
- "Defects" counts detections that triggered REJECT or REVIEW.
- Default thresholds (review 0.25, reject 0.50; quality limits) are starting values, not
  calibrated settings. Tune them on validation images from your own line.

### Image-quality checks (OpenCV)

| Metric | Method | Default rule |
| --- | --- | --- |
| Focus | Variance of the Laplacian on grayscale | ≥ 50 |
| Exposure | Mean grayscale brightness (0–255) | 30–225 |
| Clipped highlights | Share of pixels ≥ 245 | ≤ 25% |
| Resolution | Width × height | ≥ 128 × 128 |

Limitations: the Laplacian variance depends on texture and scale, so a uniform but sharp
surface can score low; brightness limits assume roughly uniform lighting. Region-of-interest
selection is not implemented.

## Web API

All JSON errors use `{ "error": { "code": string, "message": string } }`. Mutating requests
from another origin are rejected (`403 CROSS_ORIGIN`).

| Method & path | Description |
| --- | --- |
| `POST /api/inspections` | multipart: `image` (JPEG/PNG/WebP, ≤ `VI_MAX_UPLOAD_MB`), `profileId`, optional `source=upload\|camera`. Returns `201` with the stored record. `415` unsupported/non-image, `413` too large, `422` image rejected by the service as corrupt, `404` unknown profile. If the inference service is down the record is stored as REVIEW with a warning. |
| `POST /api/inspections/preview` | Same multipart fields as above. Runs the full analysis and decision and returns the record with id `LIVE`; nothing is stored or logged. Used by the live camera. |
| `GET /api/inspections` | Query: `q` (ID substring), `from`, `to` (YYYY-MM-DD, server-local days), `profileId`, `classKey`, `decision`, `sort` (`createdAt\|decision\|defectCount\|profileName`), `dir`, `page`, `pageSize` (≤100) |
| `GET /api/inspections/:id` | Full record |
| `DELETE /api/inspections/:id` | Deletes record, detections and image file |
| `GET /api/inspections/:id/image` | Stored original image (`410` if not retained) |
| `GET /api/export` | `format=csv\|json` plus the same filters as the list, or `ids=a,b,c`. `404` when nothing matches, `400` for an inverted date range, `413` above 5,000 records |
| `GET /api/health` | Proxied inference-service health with latency |
| `GET/POST /api/profiles`, `GET/PUT/DELETE /api/profiles/:id` | Product profiles (validated; `409` on duplicate product ID or deleting the last profile) |
| `GET/PUT /api/settings` | Partial update of settings |
| `POST /api/settings?action=apply-retention` | Delete stored images older than the retention window now |

### Inference service API

| Method & path | Description |
| --- | --- |
| `GET /health` | `{ status, version, quality: { available, opencvVersion }, model: { loaded, weightsPresent, modelId, modelVersion, imgsz, classes, error, … } }` |
| `POST /api/analyze` | multipart `image`, form `conf` (0–1]. Returns image size, quality metrics and `detection` with `status: ok\|unavailable\|error`. Detections: `{ classId, className, confidence, box: { x1, y1, x2, y2 } }` in image pixels, plus Ultralytics-measured `preprocessMs`, `inferenceMs`, `postprocessMs`. |
| `POST /api/quality` | Quality metrics only |
| `POST /api/predict` | Detections only; `503 MODEL_UNAVAILABLE` without weights |

Uploads are validated by signature (not the declared type), size-limited, decoded with
OpenCV, and never written to disk by the service. Internal paths and tracebacks are logged
server-side only. CORS origins come from `VI_CORS_ORIGINS`.

## Configuration

See `.env.example`. Server-side only; nothing here uses the `NEXT_PUBLIC_` prefix and no
secrets are required.

| Variable | Default | Used by |
| --- | --- | --- |
| `INFERENCE_URL` | `http://127.0.0.1:8000` | web |
| `INFERENCE_TIMEOUT_MS` | `30000` | web |
| `INFERENCE_LIVE_IMGSZ` | `480` | web: model input size for live camera frames (~450 ms vs ~760 ms at 640 on a laptop i3) |
| `VI_DATA_DIR` | `./data` | web |
| `VI_MAX_UPLOAD_MB` | `10` | web, inference |
| `VI_MODEL_PATH` | `weights/qc-yoloe.pt` | inference |
| `VI_MODEL_ID` / `VI_MODEL_VERSION` | `yoloe-qc` / `11l-text-vp-v2` | inference |
| `VI_IMGSZ` | `640` | inference: input size for stored inspections |
| `VI_WARMUP_IMGSZ` | `480` | inference: extra sizes warmed up at start |
| `VI_CORS_ORIGINS` | `http://localhost:3000` | inference |

In-app **Settings** cover the default product profile, image retention (store images on/off,
delete after N days), default export format and whether CSV exports include bounding boxes.

## Testing

```bash
npm run typecheck
npm run lint
npm test                 # vitest: decision engine, parsing/validation, export, analytics,
                         # API integration (temp DB + mocked service), UI interactions (jsdom)
npm run test:inference   # pytest: FastAPI endpoints with a stub predictor
npm run build
```

## Deployment

The app is two long-running processes with local state, so it suits a VM or container host
with a persistent disk (a VPS, Render, Railway, Fly.io), not a serverless platform such as
Vercel: SQLite and stored images need a writable disk, and the detector needs PyTorch and
about 2 GB of memory.

**Docker Compose (recommended)** — `Dockerfile` (web), `inference/Dockerfile`, `docker-compose.yml`:

```bash
git lfs pull                      # the inference image build fails on an LFS pointer file
docker compose up -d --build      # web on :3000; inference stays on the internal network
```

| Service | Build | Start | Port | Persistent storage |
| --- | --- | --- | --- | --- |
| web | `npm ci && npm run build` (Node 22) | `next start -H 0.0.0.0 -p 3000` | 3000 | `/data` (`VI_DATA_DIR`) |
| inference | `pip install` torch (CPU) + `requirements.txt` + ultralytics (Python 3.11) | `uvicorn app.main:app --host 0.0.0.0 --port 8000` | 8000 (private) | none |

Required settings: `INFERENCE_URL` on the web service must point at the inference service
(`http://inference:8000` in Compose). Everything else has defaults (see [Configuration](#configuration));
no secrets are needed. Expect ~1 s per inspection on a 4-core CPU.

**Without Docker:** run `npm ci && npm run build && npm run start` and, in `inference/`,
`uvicorn app.main:app --host 127.0.0.1 --port 8000` from the virtual environment, each under a
process manager (systemd, pm2, NSSM on Windows).

On platforms that clone the repository themselves, make sure Git LFS files are fetched
(GitHub's free LFS quota is 1 GB of bandwidth per month, about 14 clones of the weights).

## Security notes

- **No authentication.** Run on a trusted network or put the app behind an authenticating
  reverse proxy. Images are served only through `/api/inspections/:id/image`, not from a
  public folder.
- Same-origin check on mutating endpoints; parameterised SQL everywhere; generated file names
  (no user-supplied paths); CSV cells are escaped and formula-prefixed values neutralised.

## Research context and integrity

The **Models & Performance** page shows the project paper's single-run YOLOv8n baseline on the
NEU-DET image-level test split (270 images, 605 instances: precision 0.7051, recall 0.7225,
F1 0.7137, mAP@0.50 0.7668, mAP@0.50:0.95 0.4524) as a **historical research result**. It is
not a measurement of the loaded weights and not a guarantee for other lines or products.

The anomaly autoencoder reported an AUROC of 0.4791 on pooled MVTec AD test images, i.e. no
useful discrimination in that setup. It is **not integrated** into decisions and no anomaly
maps are produced. Detector + anomaly fusion and Raspberry Pi deployment are **not validated**.

## Feature status

Implemented and tested:
- All nine pages with responsive shell (sidebar / mobile drawer), breadcrumbs, live backend status, active-profile switcher
- Upload (drag-and-drop, picker) and camera capture with permission/unsupported handling; type, signature and size validation
- OpenCV quality metrics; YOLO inference path (Ultralytics) with measured timings; explicit unavailable states
- Configurable, explained decision policy; profile snapshots on each record
- Viewer with annotated/original/compare modes, zoom, pan, fit, 1:1, reset, full screen, box highlighting
- SQLite persistence, file storage, retention, search/filter/sort/pagination, delete with confirmation
- CSV/JSON export (filtered, selected or single), printable inspection and summary reports
- Analytics with day/week volume, decision split, class distribution and trend, product comparison, "Not enough data" states
- Profile editor with validation; settings

Not implemented / remaining:
- Trained weights (must be supplied), and therefore no live detection has been demonstrated in this repository
- Anomaly branch and decision fusion; calibration of scores
- Region-of-interest selection for quality checks
- Authentication and multi-user access control
- Server-side PDF generation (reports use the browser's print / save as PDF)
- Edge (Raspberry Pi) deployment and measurements
