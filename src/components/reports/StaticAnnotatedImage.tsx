import { colorForClass, detectionLabel } from "@/lib/classes";
import type { InspectionRecord } from "@/lib/types";

/** Non-interactive annotated image for printable reports; boxes scale with the image. */
export function StaticAnnotatedImage({ record }: { record: InspectionRecord }) {
  if (!record.imageAvailable) {
    return <p className="rounded border border-line p-6 text-center text-[13px] text-muted">Image not retained for this inspection.</p>;
  }
  const w = record.imageWidth;
  const h = record.imageHeight;
  const order = record.profileSnapshot.classes.map((c) => c.key);
  const font = w ? Math.max(10, w / 55) : 12;
  return (
    <div className="print-keep-color relative inline-block max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- private API image */}
      <img src={`/api/inspections/${record.id}/image`} alt={`Inspection ${record.id} image`} className="block max-h-[420px] max-w-full" />
      {w && h && record.detections.length ? (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {record.detections.map((d, i) => {
            const color = colorForClass(d.classKey, order);
            const muted = d.outcome === "below_threshold" || d.outcome === "class_disabled";
            const label = `${i + 1} ${detectionLabel(d)} ${d.confidence.toFixed(2)}`;
            const ly = d.box.y1 - font * 1.4 >= 0 ? d.box.y1 - font * 1.4 : d.box.y1;
            return (
              <g key={i}>
                <rect x={d.box.x1} y={d.box.y1} width={d.box.x2 - d.box.x1} height={d.box.y2 - d.box.y1} fill="none" stroke={color} strokeWidth={font / 5} strokeDasharray={muted ? `${font / 2} ${font / 3}` : undefined} />
                <rect x={d.box.x1} y={ly} width={label.length * font * 0.58 + font * 0.6} height={font * 1.4} fill={color} />
                <text x={d.box.x1 + font * 0.3} y={ly + font * 0.7} dominantBaseline="central" fontSize={font} fontWeight={600} fill="#fff" fontFamily="var(--font-plex-mono), ui-monospace, monospace">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
