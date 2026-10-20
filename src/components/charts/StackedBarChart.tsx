"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { IconButton } from "../ui/primitives";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface StackDatum {
  key: string;
  label: string;
  values: Record<string, number>;
}

const H = 200;
const PAD = { top: 10, right: 8, bottom: 26, left: 34 };

/** Whole-number tick step (counts never need fractions): 1, 2, 5, 10, 20, 50… */
function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((s) => s * pow).find((s) => s >= raw)!;
}

/** Vertical stacked bars with per-bar hover tooltip, legend, and a table view toggle. */
export function StackedBarChart({ data, series, caption, unit = "inspections" }: { data: StackDatum[]; series: Series[]; caption: string; unit?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const step = niceStep(Math.max(1, ...totals) / 4);
  const max = Math.max(step, Math.ceil(Math.max(0, ...totals) / step) * step);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(28, slot * 0.62));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56)));

  return (
    <figure className="m-0 min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <IconButton label={asTable ? "Show chart" : "Show data table"} onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
        </IconButton>
      </div>
      {asTable ? (
        <div className="max-h-64 overflow-auto rounded border border-line">
          <table className="w-full text-xs">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-raised text-left text-subtle">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-medium">Period</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-1.5 text-right font-medium">{s.label}</th>
                ))}
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((d, i) => (
                <tr key={d.key} className="border-t border-line">
                  <th scope="row" className="px-2 py-1 text-left font-normal text-muted">{d.label}</th>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right">{d.values[s.key] ?? 0}</td>
                  ))}
                  <td className="px-2 py-1 text-right font-medium">{totals[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-labelledby={titleId} className="block">
            <title id={titleId}>{caption}</title>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--chart-label)" className="tabular font-mono">
                  {t}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              let acc = 0;
              const segs = series
                .map((s) => ({ s, v: d.values[s.key] ?? 0 }))
                .filter((x) => x.v > 0);
              return (
                <g key={d.key} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {segs.map(({ s, v }, j) => {
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
                    const isTop = j === segs.length - 1;
                    return (
                      <path
                        key={s.key}
                        d={roundedTopRect(cx - barW / 2, y1, barW, h, isTop ? Math.min(2, barW / 3, h) : 0)}
                        fill={s.color}
                      />
                    );
                  })}
                  {(data.length - 1 - i) % labelEvery === 0 ? (
                    <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--chart-label)" className="font-mono">
                      {d.label}
                    </text>
                  ) : null}
                  <rect
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md bg-panel px-2.5 py-2 text-xs shadow-[var(--shadow-pop)]"
              style={{
                left: Math.min(Math.max(0, PAD.left + slot * hover + slot / 2 - 72), width - 150),
              }}
            >
              <p className="mb-1 font-medium text-fg">{data[hover].label}</p>
              {series.map((s) => (
                <p key={s.key} className="tabular flex items-center justify-between gap-3 text-muted">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="text-fg">{data[hover].values[s.key] ?? 0}</span>
                </p>
              ))}
              <p className="tabular mt-1 flex justify-between border-t border-line pt-1 text-muted">
                Total <span className="text-fg">{totals[hover]} {unit}</span>
              </p>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`;
}
