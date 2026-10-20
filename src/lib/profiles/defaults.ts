import { NEU_DET_CLASSES } from "../classes";
import type { ClassRule, ProductProfile, QualityRules } from "../types";

/**
 * Starting thresholds. These are configuration defaults, not values derived from a
 * calibration study; adjust them per product after validating on your own images.
 */
export const DEFAULT_QUALITY_RULES: QualityRules = {
  enabled: true,
  minBlurVariance: 50,
  minBrightness: 30,
  maxBrightness: 225,
  minWidth: 128,
  minHeight: 128,
  maxOverexposedFraction: 0.25,
};

export const DEFAULT_MODEL_ID = "yolov8n-neu-det";

export function defaultSteelProfile(now: string): ProductProfile {
  return {
    id: "neu-det-steel",
    name: "Hot-rolled steel strip",
    code: "STEEL-NEU-01",
    domain: "Steel surface defects (NEU-DET)",
    modelId: DEFAULT_MODEL_ID,
    notes:
      "Demonstration profile using the six NEU-DET surface defect classes. Thresholds are starting values and have not been calibrated for a production line.",
    autoPassEnabled: true,
    classes: NEU_DET_CLASSES.map((c) => ({
      ...c,
      enabled: true,
      rejectThreshold: 0.5,
      reviewThreshold: 0.25,
    })),
    quality: { ...DEFAULT_QUALITY_RULES },
    createdAt: now,
    updatedAt: now,
  };
}

/** Model id reported by the visual-prompt YOLOE detector (inference/weights/qc-yoloe.pt). */
export const QC_MODEL_ID = "yoloe-qc";

/** Everything the QC detector can report. Each category profile lists all of them. */
const QC_VOCAB: Array<{ key: string; label: string }> = [
  { key: "bottle", label: "Bottle" },
  { key: "charger", label: "Mobile charger" },
  { key: "marker", label: "Marker" },
  { key: "burn_mark", label: "Burn mark" },
];

type CategoryKey = "bottle" | "charger" | "marker";

const CATEGORY_DEFECTS: Record<CategoryKey, string[]> = {
  bottle: [],
  charger: ["burn_mark"],
  marker: [],
};

/**
 * Product photos: smooth surfaces have little texture (low focus floor), and catalogue-style
 * uploads on a white background are normal, so the brightness and clipping limits are loose.
 */
const CATEGORY_QUALITY: QualityRules = {
  ...DEFAULT_QUALITY_RULES,
  minBlurVariance: 15,
  minWidth: 100,
  minHeight: 100,
  maxBrightness: 245,
  maxOverexposedFraction: 0.8,
};

function categoryClasses(category: CategoryKey): ClassRule[] {
  return QC_VOCAB.map(({ key, label }): ClassRule => {
    if (key === category) return { key, label, enabled: true, role: "required", reviewThreshold: 0.12, rejectThreshold: 0.35 };
    if (key === "bottle" || key === "charger" || key === "marker") {
      // Another product in the frame means the wrong item is on the station.
      return { key, label: `Wrong item: ${label.toLowerCase()}`, enabled: true, role: "defect", reviewThreshold: 0.35, rejectThreshold: 0.55 };
    }
    return { key, label, enabled: CATEGORY_DEFECTS[category].includes(key), role: "defect", reviewThreshold: 0.3, rejectThreshold: 0.5 };
  });
}

export function defaultCategoryProfiles(now: string): ProductProfile[] {
  const base = (id: string, category: CategoryKey, name: string, code: string, notes: string): ProductProfile => ({
    id,
    name,
    code,
    domain: "Consumer product presence and visible damage",
    modelId: QC_MODEL_ID,
    notes,
    autoPassEnabled: true,
    classes: categoryClasses(category),
    quality: { ...CATEGORY_QUALITY },
    createdAt: now,
    updatedAt: now,
  });
  return [
    base("qc-bottle", "bottle", "Bottle", "BOTTLE-01", "PASS needs a bottle (plastic, transparent, glass or steel) in frame, no mobile charger or marker beside it, and a usable image."),
    base("qc-charger", "charger", "Mobile charger", "CHARGER-01", "PASS needs a mobile phone charger (wall adapter) in frame with no burn mark, no bottle or marker beside it, and a usable image."),
    base("qc-marker", "marker", "Marker", "MARKER-01", "PASS needs a marker or highlighter in frame, no bottle or mobile charger beside it, and a usable image."),
  ];
}
