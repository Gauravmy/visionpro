import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/reports/PrintButton";
import { StaticAnnotatedImage } from "@/components/reports/StaticAnnotatedImage";
import { ButtonLink, DecisionBadge, KeyValue } from "@/components/ui/primitives";
import { decisionLabel, detectionLabel } from "@/lib/classes";
import { getInspection } from "@/lib/db/inspections";
import { formatDateTime, formatMs } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Report ${decodeURIComponent(id)}` };
}

const OUTCOME: Record<string, string> = {
  reject: "Reject",
  review: "Review",
  below_threshold: "Below threshold",
  class_disabled: "Class disabled",
  unknown_class: "Unknown class",
  present: "Product",
  out_of_range: "Out of range",
};

export default async function InspectionReportPage({ params }: Props) {
  const { id } = await params;
  const found = getInspection(decodeURIComponent(id));
  if (!found) notFound();
  const r = found.record;
  const p = r.profileSnapshot;
  const q = r.quality;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <ButtonLink href={`/inspection/${r.id}`} variant="ghost" size="sm">
          <ArrowLeft aria-hidden className="h-4 w-4" /> Back to record
        </ButtonLink>
        <PrintButton />
      </div>

      <article className="rounded-lg border border-line bg-panel p-6 text-[13px] print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">VisionInspect Pro · Inspection report</p>
            <h2 className="mt-1 font-mono text-lg font-semibold text-fg">{r.id}</h2>
            <p className="tabular text-muted">{formatDateTime(r.createdAt)}</p>
          </div>
          <DecisionBadge decision={r.decision} size="lg" label={decisionLabel(r.reasons)} />
        </header>

        <section className="grid gap-6 border-b border-line py-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Product</h3>
            <KeyValue
              items={[
                ["Profile", p.name],
                ["Product ID", p.code],
                ["Domain", p.domain],
                ["Image source", r.source === "camera" ? "Camera capture" : "Upload"],
                ["File", r.originalFilename ?? "—"],
              ]}
            />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Model</h3>
            <KeyValue
              items={[
                ["Model", r.modelId ?? "Unavailable"],
                ["Version", r.modelVersion ?? "—"],
                ["Detector status", r.detectorStatus],
                ["Model inference", formatMs(r.timings.inferenceMs)],
                ["Total (server)", formatMs(r.timings.totalMs)],
              ]}
            />
          </div>
        </section>

        <section className="print-break-avoid border-b border-line py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Annotated image</h3>
          <StaticAnnotatedImage record={r} />
        </section>

        <section className="print-break-avoid border-b border-line py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Detected defects</h3>
          {r.detectorStatus !== "ok" ? (
            <p className="text-muted">No detector output: the model was unavailable for this inspection. No AI prediction was made.</p>
          ) : r.detections.length === 0 ? (
            <p className="text-muted">No detections above the detector confidence floor.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="text-xs text-subtle">
                <tr>
                  <th className="py-1 font-medium">#</th>
                  <th className="py-1 font-medium">Class</th>
                  <th className="py-1 text-right font-medium">Score</th>
                  <th className="py-1 pl-4 font-medium">Box (px)</th>
                  <th className="py-1 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {r.detections.map((d, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1">{detectionLabel(d)}</td>
                    <td className="py-1 text-right">{d.confidence.toFixed(3)}</td>
                    <td className="py-1 pl-4 font-mono text-xs">{[d.box.x1, d.box.y1, d.box.x2, d.box.y2].map((v) => Math.round(v)).join(", ")}</td>
                    <td className="py-1">{OUTCOME[d.outcome]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-subtle">Scores are raw detector confidences, not calibrated probabilities.</p>
        </section>

        <section className="print-break-avoid border-b border-line py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Decision explanation</h3>
          <ul className="list-disc space-y-1 pl-5">
            {r.reasons.map((x, i) => (
              <li key={i}>
                <span className="font-medium uppercase">{x.severity}</span>: {x.message}
                {x.rule ? <span className="text-subtle"> (Rule: {x.rule})</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="print-break-avoid py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Image quality</h3>
          {q.status === "ok" ? (
            <KeyValue
              className="max-w-md"
              items={[
                ["Resolution", `${q.metrics.width} × ${q.metrics.height} px`],
                ["Focus (variance of Laplacian)", q.metrics.blurVariance.toFixed(1)],
                ["Mean brightness", q.metrics.brightnessMean.toFixed(1)],
                ["Clipped highlights", `${(q.metrics.overexposedFraction * 100).toFixed(1)}%`],
              ]}
            />
          ) : (
            <p className="text-muted">Not measured: {q.message}</p>
          )}
          {r.warnings.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-subtle">Warnings</p>
              <ul className="list-disc pl-5">
                {r.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <footer className="border-t border-line pt-3 text-[11px] text-subtle">
          Generated {formatDateTime(new Date().toISOString())} from the stored inspection record. Values marked &quot;Not measured&quot; were not
          recorded for this inspection.
        </footer>
      </article>
    </div>
  );
}
