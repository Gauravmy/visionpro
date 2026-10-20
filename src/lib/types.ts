export type Decision = "PASS" | "REJECT" | "REVIEW";
export const DECISIONS: Decision[] = ["PASS", "REJECT", "REVIEW"];

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** One detector output, exactly as returned by the inference service. */
export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  box: Box;
  /** What the model saw for an out-of-range object (e.g. "cup"); absent for products. */
  label?: string;
}

export interface ClassRule {
  /** Canonical class key, e.g. "rolled_in_scale". */
  key: string;
  label: string;
  enabled: boolean;
  /**
   * "defect" (default): finding it is bad. "required": the product itself, which must be
   * present; for these, rejectThreshold is the score that confirms presence and
   * reviewThreshold the lowest score still treated as an uncertain sighting.
   */
  role?: "defect" | "required";
  /** Detector score at or above which the defect triggers REJECT. */
  rejectThreshold: number;
  /** Detector score at or above which (and below reject) the defect triggers REVIEW. */
  reviewThreshold: number;
}

export interface QualityRules {
  enabled: boolean;
  /** Minimum variance of the Laplacian (focus measure). */
  minBlurVariance: number;
  minBrightness: number;
  maxBrightness: number;
  minWidth: number;
  minHeight: number;
  /** Maximum fraction of pixels at or above 245 (clipped highlights). */
  maxOverexposedFraction: number;
}

export interface ProductProfile {
  id: string;
  name: string;
  /** Plant/product code entered by the user. */
  code: string;
  domain: string;
  modelId: string;
  notes: string;
  autoPassEnabled: boolean;
  classes: ClassRule[];
  quality: QualityRules;
  createdAt: string;
  updatedAt: string;
}

export interface QualityMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  blurVariance: number;
  brightnessMean: number;
  contrastStd: number;
  underexposedFraction: number;
  overexposedFraction: number;
  processingMs: number;
}

export type QualityEvidence =
  | { status: "ok"; metrics: QualityMetrics }
  | { status: "unavailable" | "error"; message: string };

export interface DetectorTimings {
  preprocessMs: number | null;
  inferenceMs: number | null;
  postprocessMs: number | null;
  totalMs: number | null;
}

export type DetectorEvidence =
  | {
      status: "ok";
      modelId: string;
      modelVersion: string;
      classes: string[];
      confThreshold: number;
      detections: Detection[];
      timings: DetectorTimings;
    }
  | {
      status: "unavailable" | "error";
      modelId: string | null;
      modelVersion: string | null;
      message: string;
    };

export type ReasonSeverity = "reject" | "review" | "info";

export interface DecisionReason {
  code: string;
  severity: ReasonSeverity;
  message: string;
  /** Human-readable statement of the configured rule that was evaluated. */
  rule?: string;
  detectionIndex?: number;
}

export type DetectionOutcome = "reject" | "review" | "below_threshold" | "class_disabled" | "unknown_class" | "present" | "out_of_range";

export interface EvaluatedDetection extends Detection {
  classKey: string;
  outcome: DetectionOutcome;
}

export interface DecisionResult {
  decision: Decision;
  reasons: DecisionReason[];
  detections: EvaluatedDetection[];
}

export interface InspectionTimings {
  /** Measured by the web server from upload receipt to stored decision. */
  totalMs: number;
  /** Round trip to the inference service as measured by the web server. */
  serviceRoundTripMs: number | null;
  decodeMs: number | null;
  qualityMs: number | null;
  preprocessMs: number | null;
  inferenceMs: number | null;
  postprocessMs: number | null;
}

export type InspectionSource = "upload" | "camera";

export interface InspectionRecord {
  id: string;
  createdAt: string;
  profileId: string;
  profileName: string;
  profileSnapshot: ProductProfile;
  decision: Decision;
  defectCount: number;
  source: InspectionSource;
  originalFilename: string | null;
  imageAvailable: boolean;
  imageMime: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageBytes: number | null;
  modelId: string | null;
  modelVersion: string | null;
  detectorStatus: DetectorEvidence["status"];
  quality: QualityEvidence;
  detections: EvaluatedDetection[];
  reasons: DecisionReason[];
  timings: InspectionTimings;
  warnings: string[];
}

export interface InspectionSummary {
  id: string;
  createdAt: string;
  profileId: string;
  profileName: string;
  decision: Decision;
  defectCount: number;
  classes: string[];
  maxConfidence: number | null;
  modelId: string | null;
  detectorStatus: string;
  imageAvailable: boolean;
  totalMs: number;
}

export interface AppSettings {
  activeProfileId: string | null;
  retainImages: boolean;
  /** Days to keep stored images; null keeps them indefinitely. */
  retentionDays: number | null;
  exportFormat: "csv" | "json";
  csvIncludeBoxes: boolean;
}

export interface SystemEvent {
  id: number;
  createdAt: string;
  type: string;
  message: string;
  inspectionId: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
