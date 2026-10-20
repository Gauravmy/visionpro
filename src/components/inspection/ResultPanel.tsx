"use client";

import { AlertTriangle, Info, XCircle } from "lucide-react";
import { classLabel, colorForClass, decisionLabel, detectionLabel, isOutOfRange } from "@/lib/classes";
import { formatBytes, formatDateTime, formatMs } from "@/lib/format";
import type { DecisionReason, InspectionRecord } from "@/lib/types";
import { DecisionBadge, KeyValue, Notice, Tag, cn } from "../ui/primitives";
import { OUTCOME_LABEL } from "./ImageViewer";

const DECISION_SUMMARY = {
  PASS: "No enabled rejection or review rule was triggered and all configured checks completed.",
  REJECT: "At least one enabled defect class reached its reject threshold.",
  REVIEW: "The result needs operator review before the part is accepted or rejected.",
} as const;

function ReasonItem({ r }: { r: DecisionReason }) {
  const Icon = r.severity === "reject" ? XCircle : r.severity === "review" ? AlertTriangle : Info;
  const color = r.severity === "reject" ? "text-reject" : r.severity === "review" ? "text-review" : "text-subtle";
  return (
    <li className="flex gap-2.5 py-2">
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
      <div className="min-w-0 text-[13px]">
        <p className="text-fg">
          <span className="sr-only">{r.severity}: </span>
          {r.message}
        </p>
        {r.rule ? <p className="mt-0.5 font-mono text-[11px] text-subtle">Rule: {r.rule}</p> : null}
      </div>
    </li>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line px-4 py-3.5", className)}>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  );
}

export function DetectionTable({
  record,
  classOrder,
  onHighlight,
}: {
  record: InspectionRecord;
  classOrder: string[];
  onHighlight?: (i: number | null) => void;
}) {
  if (record.detectorStatus !== "ok") {
    return <p className="text-[13px] text-muted">No detector output: the model was {record.detectorStatus === "error" ? "in an error state" : "unavailable"} for this inspection.</p>;
  }
  if (record.detections.length === 0) {
    return <p className="text-[13px] text-muted">The detector returned no boxes above its confidence floor.</p>;
  }
  return (
    <div className="relative -mx-4 overflow-x-auto">
      <table className="w-full min-w-[460px] text-[13px]">
        <thead>
          <tr className="text-left font-mono text-[10.5px] uppercase tracking-wider text-subtle">
            <th scope="col" className="px-4 py-1.5 font-medium">#</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Class</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Score</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Box (x1, y1, x2, y2)</th>
            <th scope="col" className="px-4 py-1.5 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {record.detections.map((d, i) => (
            <tr
              key={i}
              tabIndex={onHighlight ? 0 : undefined}
              onMouseEnter={() => onHighlight?.(i)}
              onMouseLeave={() => onHighlight?.(null)}
              onFocus={() => onHighlight?.(i)}
              onBlur={() => onHighlight?.(null)}
              className="border-t border-line/60 hover:bg-raised/60 focus:bg-raised/60"
            >
              <td className="tabular px-4 py-1.5 text-subtle">{i + 1}</td>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colorForClass(d.classKey, classOrder) }} />
                  {detectionLabel(d)}
                </span>
              </td>
              <td className="tabular px-2 py-1.5 text-right font-mono">{d.confidence.toFixed(3)}</td>
              <td className="tabular px-2 py-1.5 font-mono text-xs text-muted">
                {[d.box.x1, d.box.y1, d.box.x2, d.box.y2].map((v) => Math.round(v)).join(", ")}
              </td>
              <td className="px-4 py-1.5">
                <Tag tone={d.outcome === "reject" ? "error" : d.outcome === "review" || d.outcome === "unknown_class" || d.outcome === "out_of_range" ? "warn" : "neutral"}>
                  {OUTCOME_LABEL[d.outcome]}
                </Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 pt-2 text-[11px] text-subtle">Scores are raw detector confidences, not calibrated probabilities. Box coordinates are image pixels.</p>
    </div>
  );
}

export function Legend({ record, classOrder }: { record: InspectionRecord; classOrder: string[] }) {
  const keys = [...new Set(record.detections.map((d) => d.classKey))];
  if (!keys.length) return null;
  return (
    <ul aria-label="Defect class legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {keys.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colorForClass(k, classOrder) }} />
          {classLabel(k)}
        </li>
      ))}
      {record.detections.some((d) => d.outcome === "below_threshold" || d.outcome === "class_disabled") ? (
        <li className="text-subtle">Dashed box: not acted on</li>
      ) : null}
    </ul>
  );
}

export function ResultPanel({
  record,
  onHighlight,
  compact,
  live,
}: {
  record: InspectionRecord;
  onHighlight?: (i: number | null) => void;
  compact?: boolean;
  /** Live camera frame: not stored, so no record id. */
  live?: boolean;
}) {
  const classOrder = record.profileSnapshot.classes.map((c) => c.key);
  const q = record.quality;
  // Reject reasons first: they decide the outcome.
  const acted = record.reasons.filter((r) => r.severity !== "info").sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "reject" ? -1 : 1));
  const deciding = record.decision === "PASS" ? null : acted.find((r) => r.severity === (record.decision === "REJECT" ? "reject" : "review"));
  const info = record.reasons.filter((r) => r.severity === "info");
  const outOfRange = isOutOfRange(record.reasons);

  return (
    <div aria-live="polite">
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DecisionBadge decision={record.decision} size="lg" label={decisionLabel(record.reasons)} />
          <div className="text-right text-xs text-subtle">
            <p className="font-mono text-[12.5px] text-fg">{live ? "Live frame" : record.id}</p>
            <p className="tabular mt-0.5 font-mono text-[11px]">{formatDateTime(record.createdAt)}</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {deciding && record.detectorStatus === "ok" ? <span className="font-medium text-fg">{deciding.message}</span> : DECISION_SUMMARY[record.decision]}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-[13px]">
          {(
            [
              ["Defects", String(record.defectCount)],
              ["Inference", record.timings.inferenceMs === null ? "—" : formatMs(record.timings.inferenceMs)],
              ["Total", formatMs(record.timings.totalMs)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="bg-sunken px-3 py-2.5">
              <dt className="eyebrow">{k}</dt>
              <dd className="tabular mt-1 font-mono text-[17px] font-medium text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {outOfRange ? (
        <div className="px-4 pb-3">
          <Notice tone="error" title="Item out of range">
            This station only inspects {record.profileSnapshot.classes.filter((c) => c.role === "required").map((c) => c.label).join(", ") || "its configured products"}. Remove the item and place a supported product in view.
          </Notice>
        </div>
      ) : null}

      {record.detectorStatus !== "ok" ? (
        <div className="px-4 pb-3">
          <Notice tone="warn" title={record.detectorStatus === "error" ? "Detector error" : "Model unavailable"}>
            No AI prediction was made for this inspection. The decision is based only on the evidence listed below.
          </Notice>
        </div>
      ) : null}

      <Section title="Decision explanation">
        {acted.length ? (
          <ul className="divide-y divide-line/60">
            {acted.map((r, i) => (
              <ReasonItem key={i} r={r} />
            ))}
          </ul>
        ) : null}
        {info.length ? (
          <ul className={cn("divide-y divide-line/60", acted.length > 0 && "mt-1 border-t border-line/60")}>
            {info.map((r, i) => (
              <ReasonItem key={i} r={r} />
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title={`Detections (${record.detections.length})`}>
        <DetectionTable record={record} classOrder={classOrder} onHighlight={onHighlight} />
      </Section>

      <Section title="Image quality (OpenCV)">
        {q.status === "ok" ? (
          <KeyValue
            items={[
              ["Resolution", `${q.metrics.width} × ${q.metrics.height} px (aspect ${q.metrics.aspectRatio.toFixed(2)})`],
              ["Focus (variance of Laplacian)", `${q.metrics.blurVariance.toFixed(1)} · min ${record.profileSnapshot.quality.minBlurVariance}`],
              [
                "Mean brightness",
                `${q.metrics.brightnessMean.toFixed(1)} · range ${record.profileSnapshot.quality.minBrightness}–${record.profileSnapshot.quality.maxBrightness}`,
              ],
              ["Contrast (std. dev.)", q.metrics.contrastStd.toFixed(1)],
              ["Clipped highlights", `${(q.metrics.overexposedFraction * 100).toFixed(1)}%`],
              ["Quality rules", record.profileSnapshot.quality.enabled ? "Enabled" : "Disabled for this profile"],
            ]}
          />
        ) : (
          <p className="text-[13px] text-muted">Unavailable: {q.message}</p>
        )}
      </Section>

      {!compact ? (
        <Section title="Model and timing">
          <KeyValue
            items={[
              ["Product profile", `${record.profileSnapshot.name} (${record.profileSnapshot.code})`],
              [
                "Model",
                !record.modelId
                  ? "None (service unreachable)"
                  : `${record.modelId} · ${record.modelVersion ?? "unversioned"}${record.detectorStatus === "ok" ? "" : " (not loaded)"}`,
              ],
              ["Detector status", record.detectorStatus],
              ["Image source", `${record.source === "camera" ? "Camera capture" : "Upload"}${record.originalFilename ? ` · ${record.originalFilename}` : ""}`],
              ["Image size", formatBytes(record.imageBytes)],
              ["Decode", formatMs(record.timings.decodeMs)],
              ["Quality analysis", formatMs(record.timings.qualityMs)],
              ["Pre-process", formatMs(record.timings.preprocessMs)],
              ["Model inference", formatMs(record.timings.inferenceMs)],
              ["Post-process", formatMs(record.timings.postprocessMs)],
              ["Service round trip", formatMs(record.timings.serviceRoundTripMs)],
              ["Total (server)", formatMs(record.timings.totalMs)],
            ]}
          />
          <p className="mt-2 text-[11px] text-subtle">Total is measured on the web server from upload receipt to stored decision; it excludes browser upload time.</p>
        </Section>
      ) : null}

      {record.warnings.length ? (
        <Section title="Warnings">
          <ul className="space-y-1 text-[13px] text-review">
            {record.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
