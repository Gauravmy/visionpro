import { describe, expect, it } from "vitest";
import { defaultCategoryProfiles, defaultSteelProfile } from "../profiles/defaults";
import type { DetectorEvidence, QualityEvidence, QualityMetrics } from "../types";
import { detectorConfidenceFloor, evaluateInspection } from "./engine";

const profile = defaultSteelProfile("2026-01-01T00:00:00.000Z");

const goodMetrics: QualityMetrics = {
  width: 200,
  height: 200,
  aspectRatio: 1,
  blurVariance: 400,
  brightnessMean: 120,
  contrastStd: 40,
  underexposedFraction: 0,
  overexposedFraction: 0,
  processingMs: 2,
};
const goodQuality: QualityEvidence = { status: "ok", metrics: goodMetrics };

function detector(dets: Array<[string, number]>, modelId = profile.modelId): DetectorEvidence {
  return {
    status: "ok",
    modelId,
    modelVersion: "v1",
    classes: [],
    confThreshold: 0.25,
    detections: dets.map(([className, confidence], i) => ({
      classId: i,
      className,
      confidence,
      box: { x1: 0, y1: 0, x2: 10, y2: 10 },
    })),
    timings: { preprocessMs: 1, inferenceMs: 5, postprocessMs: 1, totalMs: 7 },
  };
}

describe("evaluateInspection", () => {
  it("passes a clean result when all checks complete", () => {
    const r = evaluateInspection({ profile, detector: detector([]), quality: goodQuality });
    expect(r.decision).toBe("PASS");
    expect(r.reasons.at(-1)?.code).toBe("CHECKS_PASSED");
  });

  it("rejects when an enabled class meets its reject threshold", () => {
    const r = evaluateInspection({ profile, detector: detector([["scratches", 0.81]]), quality: goodQuality });
    expect(r.decision).toBe("REJECT");
    expect(r.detections[0].outcome).toBe("reject");
    expect(r.reasons[0].rule).toContain(">= 0.50");
  });

  it("normalises detector class names (rolled-in_scale -> rolled_in_scale)", () => {
    const r = evaluateInspection({ profile, detector: detector([["rolled-in_scale", 0.9]]), quality: goodQuality });
    expect(r.decision).toBe("REJECT");
    expect(r.detections[0].classKey).toBe("rolled_in_scale");
  });

  it("requests review for scores inside the review band", () => {
    const r = evaluateInspection({ profile, detector: detector([["patches", 0.3]]), quality: goodQuality });
    expect(r.decision).toBe("REVIEW");
    expect(r.detections[0].outcome).toBe("review");
  });

  it("treats the reject threshold as inclusive", () => {
    const r = evaluateInspection({ profile, detector: detector([["patches", 0.5]]), quality: goodQuality });
    expect(r.decision).toBe("REJECT");
  });

  it("ignores disabled classes but records them", () => {
    const p = { ...profile, classes: profile.classes.map((c) => (c.key === "crazing" ? { ...c, enabled: false } : c)) };
    const r = evaluateInspection({ profile: p, detector: detector([["crazing", 0.95]]), quality: goodQuality });
    expect(r.decision).toBe("PASS");
    expect(r.detections[0].outcome).toBe("class_disabled");
  });

  it("reviews unknown classes", () => {
    const r = evaluateInspection({ profile, detector: detector([["dent", 0.9]]), quality: goodQuality });
    expect(r.decision).toBe("REVIEW");
    expect(r.reasons.some((x) => x.code === "UNKNOWN_CLASS")).toBe(true);
  });

  it("reviews when the detector is unavailable and never passes", () => {
    const r = evaluateInspection({
      profile,
      detector: { status: "unavailable", modelId: null, modelVersion: null, message: "Weights not found." },
      quality: goodQuality,
    });
    expect(r.decision).toBe("REVIEW");
    expect(r.detections).toHaveLength(0);
    expect(r.reasons[0].code).toBe("MODEL_UNAVAILABLE");
  });

  it("reviews when the running model differs from the profile model", () => {
    const r = evaluateInspection({ profile, detector: detector([], "other-model"), quality: goodQuality });
    expect(r.decision).toBe("REVIEW");
    expect(r.reasons[0].code).toBe("MODEL_MISMATCH");
  });

  it("reviews on quality failures and states the rule", () => {
    const r = evaluateInspection({
      profile,
      detector: detector([]),
      quality: { status: "ok", metrics: { ...goodMetrics, blurVariance: 10, brightnessMean: 10 } },
    });
    expect(r.decision).toBe("REVIEW");
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain("QUALITY_BLUR");
    expect(codes).toContain("QUALITY_DARK");
  });

  it("reviews when quality evidence is missing but checks are enabled", () => {
    const r = evaluateInspection({
      profile,
      detector: detector([]),
      quality: { status: "unavailable", message: "Service unreachable." },
    });
    expect(r.decision).toBe("REVIEW");
  });

  it("skips quality rules when disabled", () => {
    const p = { ...profile, quality: { ...profile.quality, enabled: false } };
    const r = evaluateInspection({
      profile: p,
      detector: detector([]),
      quality: { status: "unavailable", message: "n/a" },
    });
    expect(r.decision).toBe("PASS");
  });

  it("keeps REJECT precedence over quality warnings", () => {
    const r = evaluateInspection({
      profile,
      detector: detector([["inclusion", 0.9]]),
      quality: { status: "ok", metrics: { ...goodMetrics, blurVariance: 1 } },
    });
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.some((x) => x.code === "QUALITY_BLUR")).toBe(true);
  });

  it("downgrades a clean result to REVIEW when automatic PASS is disabled", () => {
    const r = evaluateInspection({
      profile: { ...profile, autoPassEnabled: false },
      detector: detector([]),
      quality: goodQuality,
    });
    expect(r.decision).toBe("REVIEW");
    expect(r.reasons.at(-1)?.code).toBe("AUTO_PASS_DISABLED");
  });
});

describe("detectorConfidenceFloor", () => {
  it("uses the lowest enabled review threshold", () => {
    const classes = profile.classes.map((c, i) => ({ ...c, reviewThreshold: 0.2 + i * 0.05 }));
    expect(detectorConfidenceFloor(classes)).toBeCloseTo(0.2);
  });
  it("clamps to a minimum of 0.01", () => {
    const classes = profile.classes.map((c) => ({ ...c, reviewThreshold: 0 }));
    expect(detectorConfidenceFloor(classes)).toBe(0.01);
  });
});

describe("required product classes", () => {
  const bottle = defaultCategoryProfiles("2026-01-01T00:00:00.000Z").find((p) => p.id === "qc-bottle")!;
  const run = (dets: Array<[string, number]>) => evaluateInspection({ profile: bottle, detector: detector(dets, bottle.modelId), quality: goodQuality });

  it("passes when the expected product is found and nothing else is", () => {
    const r = run([["bottle", 0.8]]);
    expect(r.decision).toBe("PASS");
    expect(r.detections[0].outcome).toBe("present");
    expect(r.reasons.some((x) => x.code === "PRODUCT_PRESENT")).toBe(true);
  });

  it("rejects as out of range when the expected product is missing", () => {
    const r = run([]);
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.find((x) => x.code === "OUT_OF_RANGE")?.message).toMatch(/expected Bottle/);
  });

  it("asks for review when the product is only weakly detected", () => {
    expect(run([["bottle", 0.2]]).decision).toBe("REVIEW");
  });

  it("says out of range when only an everyday object is in view", () => {
    const det = detector([["out_of_range", 0.44]], bottle.modelId);
    if (det.status === "ok") det.detections[0].label = "cup";
    const r = evaluateInspection({ profile: bottle, detector: det, quality: goodQuality });
    expect(r.decision).toBe("REJECT");
    expect(r.detections[0].outcome).toBe("out_of_range");
    expect(r.reasons.some((x) => x.code === "PRODUCT_MISSING")).toBe(false);
    expect(r.reasons.find((x) => x.code === "OUT_OF_RANGE")?.message).toMatch(/closest match: a cup/);
  });

  it("says out of range when nothing supported is recognised", () => {
    const r = run([["bottle", 0.05]]);
    expect(r.reasons.find((x) => x.code === "OUT_OF_RANGE")?.message).toMatch(/no supported product/);
  });

  it("does not name weak out-of-range guesses", () => {
    const r = run([["out_of_range", 0.2]]);
    expect(r.reasons.find((x) => x.code === "OUT_OF_RANGE")?.message).toMatch(/no supported product/);
  });

  it("ignores everyday objects next to the expected product", () => {
    const r = run([["bottle", 0.9], ["out_of_range", 0.6]]);
    expect(r.decision).toBe("PASS");
    expect(r.reasons.some((x) => x.code === "OUT_OF_RANGE" || x.code === "UNKNOWN_CLASS")).toBe(false);
  });

  it("keeps PRODUCT_MISSING when a different supported product is in view", () => {
    const r = run([["charger", 0.7], ["out_of_range", 0.6]]);
    expect(r.reasons.some((x) => x.code === "PRODUCT_MISSING")).toBe(true);
    expect(r.reasons.some((x) => x.code === "OUT_OF_RANGE")).toBe(false);
  });

  it("rejects a different product in frame", () => {
    const r = run([["bottle", 0.9], ["charger", 0.7]]);
    expect(r.decision).toBe("REJECT");
    expect(r.reasons.find((x) => x.code === "DEFECT_REJECT")?.message).toMatch(/Wrong item: mobile charger/);
  });
});
