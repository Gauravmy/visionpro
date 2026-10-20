"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Aperture, Camera, CameraOff, Pause, Play, RefreshCw } from "lucide-react";
import { colorForClass, decisionLabel, detectionLabel } from "@/lib/classes";
import type { InspectionRecord } from "@/lib/types";
import { Button, DecisionBadge, Notice, cn } from "../ui/primitives";

type CamState = { phase: "idle" } | { phase: "starting" } | { phase: "live" } | { phase: "error"; title: string; message: string };

function describeError(err: unknown): { title: string; message: string } {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return { title: "Camera permission denied", message: "Allow camera access for this site in the address bar, then press Start camera again." };
    case "NotFoundError":
    case "OverconstrainedError":
      return { title: "No camera found", message: "Connect a camera, or switch to Upload and use an image file." };
    case "NotReadableError":
      return { title: "Camera is busy", message: "Another application is using the camera. Close it and try again." };
    default:
      return { title: "Camera could not start", message: "Use an image file instead, or try a different browser." };
  }
}

/** Grab the current video frame as a JPEG. maxSide downsizes live frames to keep round trips short. */
function grabFrame(video: HTMLVideoElement, maxSide?: number): Promise<{ blob: Blob; w: number; h: number } | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  const scale = maxSide ? Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight)) : 1;
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? { blob: b, w, h } : null), "image/jpeg", maxSide ? 0.8 : 0.92));
}

export interface LiveFrame {
  record: InspectionRecord;
  width: number;
  height: number;
  latencyMs: number;
}

/**
 * Camera stage. While "Live check" is on, frames are analysed continuously through
 * /api/inspections/preview (nothing is stored) and the result is drawn over the video.
 * "Capture & inspect" hands a full-resolution frame to the normal, stored inspection.
 */
export function LiveCamera({
  profileId,
  disabled,
  onCapture,
  onLive,
}: {
  profileId: string;
  disabled?: boolean;
  onCapture: (file: File) => void;
  onLive: (frame: LiveFrame | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>({ phase: "idle" });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [live, setLive] = useState(true);
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [env, setEnv] = useState<{ supported: boolean; secure: boolean } | null>(null);
  const profileRef = useRef(profileId);
  profileRef.current = profileId;
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => setEnv({ supported: !!navigator.mediaDevices?.getUserMedia, secure: window.isSecureContext }), []);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = async (id?: string) => {
    stop();
    setState({ phase: "starting" });
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
      setDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? "");
      setState({ phase: "live" });
    } catch (err) {
      setState({ phase: "error", ...describeError(err) });
    }
  };

  // Live analysis loop: one request in flight at a time, so the rate adapts to the model's speed.
  const running = state.phase === "live" && live && !disabled;
  useEffect(() => {
    if (!running) {
      setFrame(null);
      onLiveRef.current(null);
      return;
    }
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        const v = video.current;
        const shot = v ? await grabFrame(v, 640) : null;
        if (!shot) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        const started = performance.now();
        try {
          const form = new FormData();
          form.append("image", shot.blob, "live.jpg");
          form.append("profileId", profileRef.current);
          const res = await fetch("/api/inspections/preview", { method: "POST", body: form });
          const body = await res.json();
          if (cancelled) return;
          if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
          const next = { record: body as InspectionRecord, width: shot.w, height: shot.h, latencyMs: Math.round(performance.now() - started) };
          setFrame(next);
          onLiveRef.current(next);
          setLiveError(null);
        } catch (err) {
          if (cancelled) return;
          setLiveError(err instanceof Error ? err.message : "Live analysis failed.");
          await new Promise((r) => setTimeout(r, 1500));
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [running]);

  const capture = async () => {
    const v = video.current;
    if (!v) return;
    const shot = await grabFrame(v);
    if (!shot) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    setLive(false);
    onCapture(new File([shot.blob], `camera-${stamp}.jpg`, { type: "image/jpeg" }));
  };

  if (!env) return <div className="h-[52vh] min-h-[340px] rounded-lg border border-line bg-sunken lg:h-[calc(100dvh-320px)] lg:min-h-[440px]" aria-busy="true" />;

  const order = frame?.record.profileSnapshot.classes.map((c) => c.key) ?? [];

  return (
    <div className="flex h-[52vh] min-h-[340px] flex-col overflow-hidden rounded-lg border border-line bg-panel lg:h-[calc(100dvh-320px)] lg:min-h-[440px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <div className="flex items-center gap-2 px-1">
          <span className="eyebrow">Camera</span>
          {state.phase === "live" ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-reject">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-reject" /> REC
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {state.phase === "live" && devices.length > 1 ? (
            <select
              aria-label="Camera device"
              value={deviceId}
              onChange={(e) => void start(e.target.value)}
              className="h-8 max-w-[11rem] truncate rounded-md border border-line-strong bg-panel px-2 text-[12.5px] text-fg"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          ) : null}
          {state.phase === "live" ? (
            <>
              <Button size="sm" variant={live ? "secondary" : "ghost"} onClick={() => setLive((v) => !v)} aria-pressed={live}>
                {live ? <Pause aria-hidden className="h-3.5 w-3.5" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
                {live ? "Pause live check" : "Resume live check"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  stop();
                  setState({ phase: "idle" });
                }}
              >
                <CameraOff aria-hidden className="h-3.5 w-3.5" /> Stop
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#101011]">
        <video ref={video} playsInline muted className={state.phase === "live" ? "absolute inset-0 h-full w-full object-contain" : "hidden"} />

        {state.phase === "live" && frame ? (
          <svg viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {frame.record.detections
              .filter((d) => d.outcome !== "class_disabled" && d.outcome !== "below_threshold")
              .map((d, i) => {
                const color = d.outcome === "present" ? "var(--pass)" : d.outcome === "reject" ? "var(--reject)" : d.outcome === "review" || d.outcome === "out_of_range" ? "var(--review)" : colorForClass(d.classKey, order);
                const w = d.box.x2 - d.box.x1;
                const label = `${detectionLabel(d)} ${d.confidence.toFixed(2)}`;
                return (
                  <g key={i}>
                    <rect x={d.box.x1} y={d.box.y1} width={w} height={d.box.y2 - d.box.y1} fill="none" stroke={color} strokeWidth={3} rx={3} />
                    <rect x={d.box.x1} y={Math.max(0, d.box.y1 - 20)} width={label.length * 7.4 + 12} height={20} fill={color} rx={2} />
                    <text x={d.box.x1 + 6} y={Math.max(0, d.box.y1 - 20) + 14} fontSize={12.5} fill="#fff" fontFamily="var(--font-plex-mono), monospace">
                      {label}
                    </text>
                  </g>
                );
              })}
          </svg>
        ) : null}

        {state.phase === "live" ? (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-6 border border-white/15">
              <span className="absolute -left-px -top-px h-5 w-5 border-l-2 border-t-2 border-white/70" />
              <span className="absolute -right-px -top-px h-5 w-5 border-r-2 border-t-2 border-white/70" />
              <span className="absolute -bottom-px -left-px h-5 w-5 border-b-2 border-l-2 border-white/70" />
              <span className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-white/70" />
            </span>
            <div className="absolute left-3 top-3 flex items-center gap-2" aria-live="polite">
              {frame ? (
                <span className="rounded-md bg-black/55 p-1 backdrop-blur">
                  <DecisionBadge decision={frame.record.decision} label={decisionLabel(frame.record.reasons)} />
                </span>
              ) : running ? (
                <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[11px] text-white/80 backdrop-blur">analysing…</span>
              ) : null}
              {frame ? <span className="rounded bg-black/55 px-1.5 py-1 font-mono text-[10.5px] text-white/75 backdrop-blur">{frame.latencyMs} ms / frame</span> : null}
            </div>
            <div className="absolute inset-x-0 bottom-4 flex justify-center">
              <button
                type="button"
                onClick={() => void capture()}
                disabled={disabled}
                className="group flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-[13.5px] font-medium text-[#18191b] shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#18191b] text-white">
                  <Aperture aria-hidden className="h-4 w-4" />
                </span>
                Capture &amp; inspect
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {state.phase === "starting" ? (
              <>
                <RefreshCw aria-hidden className="h-5 w-5 animate-spin text-white/70" />
                <p className="text-[13px] text-white/70">Waiting for camera permission…</p>
              </>
            ) : !env.supported || !env.secure ? (
              <div className="max-w-sm text-left">
                <Notice tone="warn" title="Camera unavailable">
                  {!env.secure ? "Browsers allow cameras only on https or localhost. Open the app through localhost." : "This browser cannot access cameras. Upload an image instead."}
                </Notice>
              </div>
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <Camera aria-hidden className="h-6 w-6 text-white/80" strokeWidth={1.6} />
                </span>
                <p className="text-[15px] font-medium text-white">Live inspection</p>
                <p className="max-w-xs text-[12.5px] leading-relaxed text-white/60">
                  Point the camera at the item. Each frame is checked against the selected product; capture to save a record.
                </p>
                {state.phase === "error" ? (
                  <div className="max-w-sm text-left">
                    <Notice tone="error" title={state.title}>
                      {state.message}
                    </Notice>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={disabled}
                  className="mt-1 inline-flex h-9 items-center gap-2 rounded-md bg-white px-4 text-[13.5px] font-medium text-[#18191b] hover:bg-white/90 disabled:opacity-50"
                >
                  <Camera aria-hidden className="h-4 w-4" /> Start camera
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {liveError && state.phase === "live" ? (
        <p role="alert" className={cn("border-t border-line px-3 py-1.5 text-[12px] text-reject")}>
          Live check paused: {liveError}
        </p>
      ) : null}
    </div>
  );
}
