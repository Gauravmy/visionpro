import type { InspectionRecord } from "./types";

/** Quote a CSV cell (RFC 4180) and neutralise spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? "" : Number(n.toFixed(digits)));

export const CSV_COLUMNS = [
  "inspection_id",
  "timestamp_utc",
  "product_profile",
  "decision",
  "defect_count",
  "defect_classes",
  "max_defect_score",
  "model_id",
  "model_version",
  "detector_status",
  "quality_status",
  "blur_variance",
  "brightness_mean",
  "image_width",
  "image_height",
  "inference_ms",
  "total_ms",
  "reasons",
  "warnings",
] as const;

export function inspectionsToCsv(records: InspectionRecord[], includeBoxes: boolean): string {
  const header = [...CSV_COLUMNS, ...(includeBoxes ? ["detections"] : [])];
  const lines = [header.join(",")];
  for (const r of records) {
    const actionable = r.detections.filter((d) => d.outcome === "reject" || d.outcome === "review");
    const maxScore = actionable.length ? Math.max(...actionable.map((d) => d.confidence)) : null;
    const q = r.quality.status === "ok" ? r.quality.metrics : null;
    const row: unknown[] = [
      r.id,
      r.createdAt,
      r.profileName,
      r.decision,
      r.defectCount,
      [...new Set(actionable.map((d) => d.classKey))].join(";"),
      num(maxScore, 4),
      r.modelId,
      r.modelVersion,
      r.detectorStatus,
      r.quality.status,
      num(q?.blurVariance),
      num(q?.brightnessMean),
      r.imageWidth,
      r.imageHeight,
      num(r.timings.inferenceMs),
      num(r.timings.totalMs),
      r.reasons.filter((x) => x.severity !== "info").map((x) => x.message).join(" | "),
      r.warnings.join(" | "),
    ];
    if (includeBoxes) {
      row.push(
        r.detections
          .map((d) => `${d.classKey}:${d.confidence.toFixed(4)}:${d.outcome}:[${[d.box.x1, d.box.y1, d.box.x2, d.box.y2].map((v) => v.toFixed(1)).join(" ")}]`)
          .join(";"),
      );
    }
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function inspectionsToJson(records: InspectionRecord[], meta: Record<string, unknown>): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...meta, count: records.length, inspections: records }, null, 2);
}
