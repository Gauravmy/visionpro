"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Columns2, Expand, Maximize, Minimize, Minus, Plus, RotateCcw } from "lucide-react";
import { colorForClass, detectionLabel } from "@/lib/classes";
import type { EvaluatedDetection } from "@/lib/types";
import { cn, IconButton } from "../ui/primitives";

export type ViewMode = "annotated" | "original" | "split";

interface Size {
  w: number;
  h: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;

const OUTCOME_LABEL: Record<EvaluatedDetection["outcome"], string> = {
  reject: "reject",
  review: "review",
  below_threshold: "below threshold",
  class_disabled: "class disabled",
  unknown_class: "unknown class",
  present: "product",
  out_of_range: "out of range",
};

function Overlay({
  size,
  detections,
  classOrder,
  pixelScale,
  highlight,
}: {
  size: Size;
  detections: EvaluatedDetection[];
  classOrder: string[];
  pixelScale: number;
  highlight: number | null;
}) {
  const u = 1 / pixelScale; // one screen pixel in image units
  const font = 11 * u;
  return (
    <svg
      viewBox={`0 0 ${size.w} ${size.h}`}
      width={size.w}
      height={size.h}
      className="pointer-events-none absolute left-0 top-0"
      aria-hidden
    >
      {detections.map((d, i) => {
        const color = colorForClass(d.classKey, classOrder);
        const muted = d.outcome === "below_threshold" || d.outcome === "class_disabled";
        const x = Math.max(0, d.box.x1);
        const y = Math.max(0, d.box.y1);
        const w = Math.max(1, d.box.x2 - d.box.x1);
        const h = Math.max(1, d.box.y2 - d.box.y1);
        const label = `${detectionLabel(d)} ${d.confidence.toFixed(2)}`;
        const labelW = (label.length * 6.4 + 10) * u;
        const labelH = 16 * u;
        const labelY = y - labelH >= 0 ? y - labelH : y;
        const active = highlight === null || highlight === i;
        return (
          <g key={i} opacity={active ? 1 : 0.3}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={highlight === i ? `${color}22` : "none"}
              stroke={color}
              strokeWidth={(highlight === i ? 3 : 2) * u}
              strokeDasharray={muted ? `${5 * u} ${4 * u}` : undefined}
            />
            <rect x={x} y={labelY} width={labelW} height={labelH} fill={color} opacity={muted ? 0.75 : 1} />
            <text x={x + 5 * u} y={labelY + labelH / 2} dominantBaseline="central" fontSize={font} fontWeight={500} fill="#fff" fontFamily="var(--font-plex-mono), ui-monospace, monospace">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Zoomable, pannable image viewer with a bounding-box overlay drawn in image pixel coordinates.
 * In split mode the original and annotated views share one transform so they stay aligned.
 */
export function ImageViewer({
  src,
  detections,
  classOrder,
  highlight = null,
  initialMode = "annotated",
  emptyLabel,
  showAnnotations = true,
}: {
  src: string | null;
  detections: EvaluatedDetection[];
  classOrder: string[];
  highlight?: number | null;
  initialMode?: ViewMode;
  emptyLabel?: React.ReactNode;
  showAnnotations?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [paneSize, setPaneSize] = useState<Size>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [fullscreen, setFullscreen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const effectiveMode: ViewMode = showAnnotations ? mode : "original";

  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setLoadError(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    // A server-rendered image can finish loading before hydration attaches onLoad, so read its size directly.
    const img = imgRef.current;
    setNatural(img?.complete && img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    if (img?.complete && img.naturalWidth === 0 && src) setLoadError(true);
  }, [src]);

  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPaneSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [effectiveMode, src]);

  // Capability checks run after mount so server and client render the same markup.
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  useEffect(() => setFullscreenSupported(!!document.fullscreenEnabled), []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const fit = natural && paneSize.w && paneSize.h ? Math.min(paneSize.w / natural.w, paneSize.h / natural.h) * 0.96 : 1;
  const scale = fit * zoom;
  const baseX = natural ? (paneSize.w - natural.w * scale) / 2 : 0;
  const baseY = natural ? (paneSize.h - natural.h * scale) / 2 : 0;

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  /** Zoom keeping the image point under (px, py) — pane coordinates — fixed. */
  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) => {
      if (!natural) return;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
      const cx = px ?? paneSize.w / 2;
      const cy = py ?? paneSize.h / 2;
      const oldScale = fit * zoom;
      const newScale = fit * next;
      const imgX = (cx - baseX - offset.x) / oldScale;
      const imgY = (cy - baseY - offset.y) / oldScale;
      const newBaseX = (paneSize.w - natural.w * newScale) / 2;
      const newBaseY = (paneSize.h - natural.h * newScale) / 2;
      setOffset({ x: cx - newBaseX - imgX * newScale, y: cy - newBaseY - imgY * newScale });
      setZoom(next);
    },
    [natural, zoom, paneSize, fit, baseX, baseY, offset],
  );

  // Wheel zoom needs a non-passive listener so the page does not scroll underneath.
  const region = useRef<HTMLDivElement>(null);
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      const paneEl = (e.target as HTMLElement).closest("[data-pane]");
      if (!paneEl) return;
      e.preventDefault();
      const rect = paneEl.getBoundingClientRect();
      zoomAtRef.current(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!natural || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 40;
    const map: Record<string, () => void> = {
      "+": () => zoomAt(1.25),
      "=": () => zoomAt(1.25),
      "-": () => zoomAt(0.8),
      "0": reset,
      ArrowLeft: () => setOffset((o) => ({ ...o, x: o.x + step })),
      ArrowRight: () => setOffset((o) => ({ ...o, x: o.x - step })),
      ArrowUp: () => setOffset((o) => ({ ...o, y: o.y + step })),
      ArrowDown: () => setOffset((o) => ({ ...o, y: o.y - step })),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const toggleFullscreen = async () => {
    if (!root.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.current.requestFullscreen().catch(() => undefined);
  };


  const renderPane = (annotated: boolean, label?: string, attachRef = false) => (
    <div
      ref={attachRef ? pane : undefined}
      className={cn("relative min-h-0 flex-1 overflow-hidden", src ? "bg-[#101011]" : "bg-sunken", natural ? "cursor-grab active:cursor-grabbing" : "")}
      data-pane
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={
        src
          ? {
              backgroundImage: "linear-gradient(45deg,#161618 25%,transparent 25%),linear-gradient(-45deg,#161618 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#161618 75%),linear-gradient(-45deg,transparent 75%,#161618 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
              touchAction: "none",
            }
          : { touchAction: "none" }
      }
    >
      {src && !loadError ? (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: natural?.w,
            height: natural?.h,
            transform: `translate(${baseX + offset.x}px, ${baseY + offset.y}px) scale(${scale})`,
            visibility: natural ? "visible" : "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob/object URLs and private API images are not optimisable */}
          <img
            ref={attachRef ? imgRef : undefined}
            src={src}
            alt={annotated ? "Inspected image with defect annotations" : "Original inspected image"}
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setLoadError(true)}
            className="block max-w-none select-none"
            style={{ width: natural?.w, height: natural?.h, imageRendering: scale > 3 ? "pixelated" : "auto" }}
          />
          {annotated && natural ? <Overlay size={natural} detections={detections} classOrder={classOrder} pixelScale={scale} highlight={highlight} /> : null}
        </div>
      ) : (
        <div className="absolute inset-3 flex items-center justify-center rounded-md border border-dashed border-line-strong p-6 text-center text-[13px] text-muted">
          {loadError ? "The image could not be displayed. It may have been removed by the retention policy." : emptyLabel}
        </div>
      )}
      {label ? <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-white/80">{label}</span> : null}
    </div>
  );

  return (
    <div
      ref={root}
      className={cn("flex flex-col overflow-hidden rounded-lg border border-line bg-panel", fullscreen ? "h-screen" : "h-[52vh] min-h-[340px] lg:h-[calc(100dvh-320px)] lg:min-h-[440px]")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        {showAnnotations ? (
          <div role="group" aria-label="View mode" className="flex rounded-md bg-raised p-0.5">
            {(
              [
                ["annotated", "Annotated"],
                ["original", "Original"],
                ["split", "Compare"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
                  mode === m ? "bg-panel text-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-muted hover:text-fg",
                )}
              >
                {m === "split" ? <Columns2 aria-hidden className="h-3.5 w-3.5" /> : null}
                {label}
              </button>
            ))}
          </div>
        ) : (
          <span className="eyebrow px-2">Preview</span>
        )}
        <div className="flex items-center gap-0.5">
          <IconButton label="Zoom out (-)" onClick={() => zoomAt(0.8)} disabled={!natural || zoom <= MIN_ZOOM}>
            <Minus className="h-4 w-4" />
          </IconButton>
          <span className="tabular w-12 text-center font-mono text-[11.5px] text-muted" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <IconButton label="Zoom in (+)" onClick={() => zoomAt(1.25)} disabled={!natural || zoom >= MAX_ZOOM}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton label="Fit to screen" onClick={reset} disabled={!natural}>
            <Expand className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Actual size (100%)"
            onClick={() => {
              setOffset({ x: 0, y: 0 });
              setZoom(1 / fit);
            }}
            disabled={!natural}
          >
            <span className="text-[10px] font-semibold">1:1</span>
          </IconButton>
          <IconButton label="Reset view (0)" onClick={reset} disabled={!natural}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          {fullscreenSupported ? (
            <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen} disabled={!src}>
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </IconButton>
          ) : null}
        </div>
      </div>
      <div
        ref={region}
        tabIndex={src ? 0 : -1}
        onKeyDown={onKeyDown}
        aria-label="Image viewer. Use plus and minus to zoom, arrow keys to pan, 0 to reset."
        role="region"
        className="flex min-h-0 flex-1 gap-px bg-line focus-visible:outline-offset-[-2px]"
      >
        {effectiveMode === "split" ? (
          <>
            {renderPane(false, "Original", true)}
            {renderPane(true, "Annotated")}
          </>
        ) : (
          renderPane(effectiveMode === "annotated", undefined, true)
        )}
      </div>
      {natural ? (
        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 font-mono text-[11px] text-subtle">
          <span className="tabular">
            {natural.w} × {natural.h} px
          </span>
          <span>Scroll to zoom · drag to pan</span>
        </div>
      ) : null}
    </div>
  );
}

export { OUTCOME_LABEL };
