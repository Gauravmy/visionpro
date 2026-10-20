import { NEU_DET_CLASSES } from "../classes";
import { DEFAULT_MODEL_ID, QC_MODEL_ID } from "../profiles/defaults";

export interface ResearchMetric {
  label: string;
  value: string;
}

export interface RegistryEntry {
  modelId: string;
  name: string;
  framework: string;
  task: string;
  classes: string[];
  inputResolution: string;
  artifact: string;
  /** Historical research results. Not live performance and not a guarantee for other domains. */
  research: {
    source: string;
    dataset: string;
    split: string;
    runs: string;
    metrics: ResearchMetric[];
    caveats: string[];
  } | null;
}

export const MODEL_REGISTRY: RegistryEntry[] = [
  {
    modelId: QC_MODEL_ID,
    name: "YOLOE-11l — bottle / mobile charger / marker",
    framework: "Ultralytics YOLOE (PyTorch .pt), CPU",
    task: "Open-vocabulary detection: text prompts plus reference-photo prompts; no training run",
    classes: ["Bottle (plastic, transparent, glass, steel)", "Mobile charger", "Marker / highlighter", "Burn mark"],
    inputResolution: "640 px (VI_IMGSZ). Uploads and captures get a second zoomed-out pass when nothing is found; live frames do not",
    artifact: "inference/weights/qc-yoloe.pt, built by inference/tools/build_qc_model.py (19 text prompts, 13 reference photos, 11 distractors)",
    research: {
      source: "Check run while building detector v2 (18 Oct 2026)",
      dataset: "24 labelled photos: 9 of your own camera captures/uploads (4 steel, 4 plastic/clear bottles, 1 tablet) plus 15 web photos",
      split: "Each photo decided under all three profiles; correct = PASS on its own product and REJECT on the others",
      runs: "Single run. Your charger capture is also a reference photo, so it is not an independent test",
      metrics: [
        { label: "Fully correct", value: "20 / 24" },
        { label: "Steel bottles", value: "4 / 4" },
        { label: "Plastic / clear bottles", value: "6 / 6" },
        { label: "Mobile chargers", value: "3 / 4" },
        { label: "CPU time / image", value: "≈0.7 s" },
      ],
      caveats: [
        "A small check, not a validation study. Lighting, background and distance on your line will change scores.",
        "Remaining misses: a wall-wart adapter seen edge-on, a cup crowded with tiny pens and a calligraphy pen.",
        "Your 148 px close-up bottle upload is found only by the zoomed-out second pass (score 0.71).",
        "Burn-mark detection comes from text prompts and one reference photo: treat it as a hint.",
        "Add 2–5 photos of your own items to inference/weights/references and rebuild to improve recall.",
      ],
    },
  },
  {
    modelId: DEFAULT_MODEL_ID,
    name: "YOLOv8n — NEU-DET steel surface defects",
    framework: "Ultralytics YOLO (PyTorch .pt)",
    task: "Object detection (bounding boxes)",
    classes: NEU_DET_CLASSES.map((c) => c.label),
    inputResolution: "Configured by VI_IMGSZ on the inference service (default 640 px)",
    artifact: "Trained weights expected at VI_MODEL_PATH (not included in this repository)",
    research: {
      source: "VisionInspect Pro research paper — reported YOLOv8n baseline",
      dataset: "NEU-DET (Northeastern University surface defect database), six classes",
      split: "Image-level test split: 270 test images, 605 annotated instances",
      runs: "Single run (no repeated-run variance reported)",
      metrics: [
        { label: "Precision", value: "0.7051" },
        { label: "Recall", value: "0.7225" },
        { label: "F1-score", value: "0.7137" },
        { label: "mAP@0.50", value: "0.7668" },
        { label: "mAP@0.50:0.95", value: "0.4524" },
      ],
      caveats: [
        "Historical research result from one training run; not measured on the currently loaded weights.",
        "The baseline used an image-level split; the paper itself recommends product- or batch-level splitting to avoid leakage.",
        "Benchmark performance does not transfer automatically to other steel lines, cameras, lighting or product domains.",
      ],
    },
  },
];

export const ANOMALY_BRANCH = {
  name: "Convolutional autoencoder anomaly branch",
  dataset: "MVTec AD, pooled test images",
  auroc: "0.4791",
  interpretation:
    "An AUROC below 0.5 means the anomaly score did not separate normal from defective images better than chance in this setup. The branch is not integrated into inspection decisions, and no anomaly maps are produced.",
};

export const UNVALIDATED_COMPONENTS = [
  "Detector + anomaly decision fusion: proposed in the research paper, not experimentally validated end to end.",
  "Raspberry Pi edge deployment: latency, memory and thermal measurements have not been reported.",
];
