/**
 * Inspection decision policy.
 *
 * Precedence: REJECT > REVIEW > PASS. Every reason that applies is recorded,
 * so the operator sees the full evidence even when a higher-severity reason
 * determines the outcome.
 *
 * - REJECT: an enabled defect class is detected with a score >= its reject threshold,
 *   or a required product class is not found at all. When nothing the profile knows is
 *   in view (only everyday objects such as a cup, or nothing at all), the item is
 *   reported as OUT_OF_RANGE: it is not one of the supported products.
 * - REVIEW: the detector is unavailable or failed; the running model does not
 *   match the profile; a detection falls in the review band; a class unknown to
 *   the profile is detected; an image-quality rule fails or quality evidence is
 *   missing; a required product is only weakly detected; or automatic PASS is
 *   disabled for the profile.
 * - PASS: only when every configured check completed and nothing above applies.
 *
 * Detector scores are compared with thresholds as raw model scores. They are
 * not calibrated probabilities.
 */
import { classKey } from "../classes";
import type {
  ClassRule,
  DecisionReason,
  DecisionResult,
  DetectorEvidence,
  EvaluatedDetection,
  ProductProfile,
  QualityEvidence,
} from "../types";

export interface DecisionInput {
  profile: Pick<ProductProfile, "modelId" | "autoPassEnabled" | "classes" | "quality">;
  detector: DetectorEvidence;
  quality: QualityEvidence;
}

const fmt = (n: number, digits = 2) => n.toFixed(digits);

/** Detector class for everyday objects that are not a supported product (cup, book, keys...). */
export const OUT_OF_RANGE_KEY = "out_of_range";
/** Lowest score at which an out-of-range object is named in the explanation. */
export const OUT_OF_RANGE_NAME_MIN = 0.35;

const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

export function evaluateInspection({ profile, detector, quality }: DecisionInput): DecisionResult {
  const reasons: DecisionReason[] = [];
  const detections: EvaluatedDetection[] = [];

  // 1. Detector evidence
  if (detector.status !== "ok") {
    reasons.push({
      code: detector.status === "unavailable" ? "MODEL_UNAVAILABLE" : "MODEL_ERROR",
      severity: "review",
      message:
        detector.status === "unavailable"
          ? `Detector unavailable: ${detector.message} No defect evidence was produced, so the part cannot be passed automatically.`
          : `Detector failed: ${detector.message} No defect evidence was produced.`,
      rule: "A detector result is required for PASS or REJECT.",
    });
  } else {
    if (classKey(detector.modelId) !== classKey(profile.modelId)) {
      reasons.push({
        code: "MODEL_MISMATCH",
        severity: "review",
        message: `Running model "${detector.modelId}" differs from the profile's model "${profile.modelId}".`,
        rule: "The detector must match the model assigned to the product profile.",
      });
    }
    const rules = new Map<string, ClassRule>(profile.classes.map((c) => [c.key, c]));
    detector.detections.forEach((det, index) => {
      const key = classKey(det.className);
      const rule = rules.get(key);
      const score = fmt(det.confidence);
      if (key === OUT_OF_RANGE_KEY && !rule) {
        // Judged once below: it only matters when no supported product is in view.
        detections.push({ ...det, classKey: key, outcome: "out_of_range" });
        return;
      }
      if (!rule) {
        detections.push({ ...det, classKey: key, outcome: "unknown_class" });
        reasons.push({
          code: "UNKNOWN_CLASS",
          severity: "review",
          message: `Detected class "${det.className}" (score ${score}) is not configured for this product.`,
          rule: "Classes outside the product profile require human review.",
          detectionIndex: index,
        });
        return;
      }
      if (!rule.enabled) {
        detections.push({ ...det, classKey: key, outcome: "class_disabled" });
        reasons.push({
          code: "CLASS_DISABLED",
          severity: "info",
          message: `${rule.label} (score ${score}) ignored: class disabled in this profile.`,
          detectionIndex: index,
        });
        return;
      }
      if (rule.role === "required") {
        // Presence is judged once per class below; every sighting is shown as the product.
        detections.push({ ...det, classKey: key, outcome: "present" });
        return;
      }
      if (det.confidence >= rule.rejectThreshold) {
        detections.push({ ...det, classKey: key, outcome: "reject" });
        reasons.push({
          code: "DEFECT_REJECT",
          severity: "reject",
          message: `${rule.label} detected with score ${score}.`,
          rule: `${rule.label}: score >= ${fmt(rule.rejectThreshold)} rejects.`,
          detectionIndex: index,
        });
      } else if (det.confidence >= rule.reviewThreshold) {
        detections.push({ ...det, classKey: key, outcome: "review" });
        reasons.push({
          code: "DEFECT_AMBIGUOUS",
          severity: "review",
          message: `${rule.label} detected with score ${score}, inside the review band.`,
          rule: `${rule.label}: ${fmt(rule.reviewThreshold)} <= score < ${fmt(rule.rejectThreshold)} requires review.`,
          detectionIndex: index,
        });
      } else {
        detections.push({ ...det, classKey: key, outcome: "below_threshold" });
        reasons.push({
          code: "BELOW_THRESHOLD",
          severity: "info",
          message: `${rule.label} candidate with score ${score} is below the review threshold.`,
          rule: `${rule.label}: score < ${fmt(rule.reviewThreshold)} is not acted on.`,
          detectionIndex: index,
        });
      }
    });

    // Required product classes: the expected item must be in the image.
    // A configured class at review level or above (e.g. a wrong product) counts as "known".
    const knownInView = detector.detections.some((d) => {
      const rule = rules.get(classKey(d.className));
      return !!rule && rule.enabled && d.confidence >= rule.reviewThreshold;
    });
    let outOfRangeReported = false;
    for (const rule of profile.classes) {
      if (rule.role !== "required" || !rule.enabled) continue;
      const sightings = detector.detections.map((d, i) => ({ d, i })).filter(({ d }) => classKey(d.className) === rule.key);
      const best = sightings.reduce<{ d: (typeof detector.detections)[number]; i: number } | null>(
        (a, b) => (!a || b.d.confidence > a.d.confidence ? b : a),
        null,
      );
      if (best && best.d.confidence >= rule.rejectThreshold) {
        reasons.push({
          code: "PRODUCT_PRESENT",
          severity: "info",
          message: `${rule.label} found with score ${fmt(best.d.confidence)}.`,
          rule: `${rule.label} must be present with score >= ${fmt(rule.rejectThreshold)}.`,
          detectionIndex: best.i,
        });
      } else if (best && best.d.confidence >= rule.reviewThreshold) {
        reasons.push({
          code: "PRODUCT_UNCERTAIN",
          severity: "review",
          message: `${rule.label} only weakly detected (score ${fmt(best.d.confidence)}); confirm the item manually.`,
          rule: `${rule.label}: ${fmt(rule.reviewThreshold)} <= score < ${fmt(rule.rejectThreshold)} requires review.`,
          detectionIndex: best.i,
        });
      } else if (!knownInView) {
        if (outOfRangeReported) continue;
        outOfRangeReported = true;
        const seen = detections
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => d.outcome === "out_of_range" && d.confidence >= OUT_OF_RANGE_NAME_MIN)
          .sort((a, b) => b.d.confidence - a.d.confidence);
        const names = [...new Set(seen.map(({ d }) => d.label?.trim() || "unrecognised object"))].slice(0, 3);
        reasons.push({
          code: "OUT_OF_RANGE",
          severity: "reject",
          message: names.length
            ? `Out of range: the item in view is not a supported product (closest match: ${names.map(withArticle).join(", ")}; expected ${rule.label}).`
            : `Out of range: no supported product was recognised in view (expected ${rule.label}).`,
          rule: "Only the products configured for this station can be inspected; anything else is out of range.",
          detectionIndex: seen[0]?.i,
        });
      } else {
        reasons.push({
          code: "PRODUCT_MISSING",
          severity: "reject",
          message: `Expected product "${rule.label}" was not found in the image${best ? ` (best score ${fmt(best.d.confidence)})` : ""}.`,
          rule: `${rule.label} must be present with score >= ${fmt(rule.rejectThreshold)}.`,
        });
      }
    }
  }

  // 2. Image quality
  const q = profile.quality;
  if (q.enabled) {
    if (quality.status !== "ok") {
      reasons.push({
        code: "QUALITY_UNAVAILABLE",
        severity: "review",
        message: `Image-quality check could not run: ${quality.message}`,
        rule: "Image-quality checks are enabled for this profile.",
      });
    } else {
      const m = quality.metrics;
      if (m.width < q.minWidth || m.height < q.minHeight) {
        reasons.push({
          code: "QUALITY_RESOLUTION",
          severity: "review",
          message: `Image is ${m.width}x${m.height} px, below the minimum ${q.minWidth}x${q.minHeight} px.`,
          rule: `Minimum resolution ${q.minWidth}x${q.minHeight} px.`,
        });
      }
      if (m.blurVariance < q.minBlurVariance) {
        reasons.push({
          code: "QUALITY_BLUR",
          severity: "review",
          message: `Focus measure ${fmt(m.blurVariance, 1)} is below ${fmt(q.minBlurVariance, 1)}; the image may be blurred.`,
          rule: `Variance of Laplacian >= ${fmt(q.minBlurVariance, 1)}.`,
        });
      }
      if (m.brightnessMean < q.minBrightness) {
        reasons.push({
          code: "QUALITY_DARK",
          severity: "review",
          message: `Mean brightness ${fmt(m.brightnessMean, 1)} is below ${fmt(q.minBrightness, 1)} (underexposed).`,
          rule: `Mean brightness >= ${fmt(q.minBrightness, 1)} (0-255).`,
        });
      }
      if (m.brightnessMean > q.maxBrightness) {
        reasons.push({
          code: "QUALITY_BRIGHT",
          severity: "review",
          message: `Mean brightness ${fmt(m.brightnessMean, 1)} exceeds ${fmt(q.maxBrightness, 1)} (overexposed).`,
          rule: `Mean brightness <= ${fmt(q.maxBrightness, 1)} (0-255).`,
        });
      }
      if (m.overexposedFraction > q.maxOverexposedFraction) {
        reasons.push({
          code: "QUALITY_CLIPPED",
          severity: "review",
          message: `${fmt(m.overexposedFraction * 100, 1)}% of pixels are clipped highlights (limit ${fmt(q.maxOverexposedFraction * 100, 1)}%).`,
          rule: `Clipped-highlight fraction <= ${fmt(q.maxOverexposedFraction * 100, 1)}%.`,
        });
      }
    }
  }

  // 3. Outcome
  const hasReject = reasons.some((r) => r.severity === "reject");
  const hasReview = reasons.some((r) => r.severity === "review");
  if (hasReject) return { decision: "REJECT", reasons, detections };
  if (hasReview) return { decision: "REVIEW", reasons, detections };
  if (!profile.autoPassEnabled) {
    reasons.push({
      code: "AUTO_PASS_DISABLED",
      severity: "review",
      message: "No rejection rule triggered, but automatic PASS is disabled for this profile.",
      rule: "Automatic PASS disabled: clean results require operator confirmation.",
    });
    return { decision: "REVIEW", reasons, detections };
  }
  reasons.push({
    code: "CHECKS_PASSED",
    severity: "info",
    message:
      detections.length === 0
        ? "The detector returned no defects above its confidence floor and all enabled checks completed."
        : "No detection reached a review or reject threshold and all enabled checks completed.",
  });
  return { decision: "PASS", reasons, detections };
}

/** Lowest enabled review threshold; used as the detector's confidence floor so no actionable box is dropped. */
export function detectorConfidenceFloor(classes: ClassRule[]): number {
  const enabled = classes.filter((c) => c.enabled).map((c) => c.reviewThreshold);
  const floor = enabled.length ? Math.min(...enabled) : 0.25;
  return Math.min(1, Math.max(0.01, floor));
}
