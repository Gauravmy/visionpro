"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Boxes, Camera, Check, FileImage, Highlighter, Loader2, Milk, Play, PlugZap, RotateCcw, Upload, X, type LucideIcon } from "lucide-react";
import { checkFileMeta, sniffImageMime, ACCEPT_ATTR, DEFAULT_MAX_UPLOAD_MB } from "@/lib/upload";
import { formatBytes } from "@/lib/format";
import type { InspectionRecord, InspectionSource, ProductProfile } from "@/lib/types";
import { READINESS_LABEL, readinessOf, useBackendStatus } from "../shell/BackendStatus";
import { Button, ButtonLink, Notice, Panel, StatusDot, cn } from "../ui/primitives";
import { ImageViewer } from "./ImageViewer";
import { LiveCamera, type LiveFrame } from "./LiveCamera";
import { Legend, ResultPanel } from "./ResultPanel";

type Phase =
  | { name: "empty" }
  | { name: "ready" }
  | { name: "uploading"; pct: number }
  | { name: "analyzing" }
  | { name: "done"; record: InspectionRecord }
  | { name: "failed"; message: string };

type WorkspaceProfile = Pick<ProductProfile, "id" | "name" | "code" | "classes" | "modelId"> & { quality?: ProductProfile["quality"] };

export interface WorkspaceProps {
  profiles: WorkspaceProfile[];
  activeProfileId: string | null;
  initialSource: InspectionSource;
  /** Focus the file picker on load (used by the dashboard's "Upload image" action). */
  focusUpload?: boolean;
  maxUploadMb?: number;
}

/** Send the inspection with XHR so real upload progress can be shown. */
function postInspection(form: FormData, onProgress: (pct: number) => void, onUploaded: () => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/inspections");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = onUploaded;
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response });
    xhr.onerror = () => reject(new Error("Network error: the web server could not be reached."));
    xhr.ontimeout = () => reject(new Error("The request timed out."));
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

function iconFor(p: WorkspaceProfile): LucideIcon {
  const required = p.classes.find((c) => c.role === "required")?.key;
  return required === "bottle" ? Milk : required === "charger" ? PlugZap : required === "marker" ? Highlighter : Boxes;
}

/** Plain-language pass criteria for a profile. */
function criteriaFor(p: WorkspaceProfile & { quality?: ProductProfile["quality"] }): Array<{ ok: boolean; text: string }> {
  const enabled = p.classes.filter((c) => c.enabled);
  const required = enabled.filter((c) => c.role === "required").map((c) => c.label);
  const wrong = enabled.filter((c) => c.role !== "required" && c.label.startsWith("Wrong item:")).map((c) => c.label.replace(/^Wrong item:\s*/, ""));
  const defects = enabled.filter((c) => c.role !== "required" && !c.label.startsWith("Wrong item:")).map((c) => c.label.toLowerCase());
  const lines: Array<{ ok: boolean; text: string }> = required.map((r) => ({ ok: true, text: `${r} is in frame` }));
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}` : xs[0]);
  if (wrong.length) lines.push({ ok: false, text: `No ${join(wrong)} in frame` });
  if (defects.length) lines.push({ ok: false, text: `No ${join(defects)}` });
  if (p.quality?.enabled) lines.push({ ok: true, text: "Image is sharp, well exposed and large enough" });
  return lines;
}

function ProductPicker({ profiles, value, onChange, disabled }: { profiles: WorkspaceProfile[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Product to inspect" className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {profiles.map((p) => {
        const Icon = iconFor(p);
        const selected = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(p.id)}
            className={cn(
              "group relative flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow] disabled:opacity-60",
              selected ? "border-ink bg-panel shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-panel/60 hover:border-line-strong hover:bg-panel",
            )}
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", selected ? "bg-ink text-ink-fg" : "bg-raised text-muted")}>
              <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-fg">{p.name}</span>
              <span className="mt-0.5 block truncate font-mono text-[11px] text-subtle">{p.code}</span>
            </span>
            {selected ? (
              <span aria-hidden className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-ink-fg">
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function InspectionWorkspace({ profiles, activeProfileId, initialSource, focusUpload, maxUploadMb = DEFAULT_MAX_UPLOAD_MB }: WorkspaceProps) {
  const router = useRouter();
  const { state: backend } = useBackendStatus();
  const readiness = readinessOf(backend);
  const [profileId, setProfileId] = useState(activeProfileId ?? profiles[0]?.id ?? "");
  const [tab, setTab] = useState<InspectionSource>(initialSource);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<InspectionSource>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "empty" });
  const [dragOver, setDragOver] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [liveFrame, setLiveFrame] = useState<LiveFrame | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusUpload) chooseButton.current?.focus();
  }, [focusUpload]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const profile = profiles.find((p) => p.id === profileId);
  const busy = phase.name === "uploading" || phase.name === "analyzing";
  const showCamera = tab === "camera" && !file;

  const run = useCallback(
    async (f: File | null = file, from: InspectionSource = source) => {
      if (!f || !profileId) return;
      const form = new FormData();
      form.append("image", f, f.name);
      form.append("profileId", profileId);
      form.append("source", from);
      setPhase({ name: "uploading", pct: 0 });
      try {
        const { status, body } = await postInspection(
          form,
          (pct) => setPhase({ name: "uploading", pct }),
          () => setPhase({ name: "analyzing" }),
        );
        if (status === 201) {
          setPhase({ name: "done", record: body as InspectionRecord });
          router.refresh();
        } else {
          const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (HTTP ${status}).`;
          setPhase({ name: "failed", message: msg });
        }
      } catch (err) {
        setPhase({ name: "failed", message: err instanceof Error ? err.message : "The inspection request failed." });
      }
    },
    [file, source, profileId, router],
  );

  const accept = useCallback(
    async (f: File, from: InspectionSource, autoRun = false) => {
      setValidation(null);
      const meta = checkFileMeta(f, maxUploadMb);
      if (!meta.ok) {
        setValidation(meta.message);
        return;
      }
      const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
      if (!sniffImageMime(head)) {
        setValidation("The file contents are not a JPEG, PNG or WebP image.");
        return;
      }
      setFile(f);
      setSource(from);
      setPreviewUrl(URL.createObjectURL(f));
      setPhase({ name: "ready" });
      setHighlight(null);
      if (autoRun) void run(f, from);
    },
    [maxUploadMb, run],
  );

  const clear = () => {
    setFile(null);
    setPreviewUrl(null);
    setValidation(null);
    setPhase({ name: "empty" });
    setHighlight(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void accept(f, "upload");
  };

  const record = phase.name === "done" ? phase.record : null;
  const classOrder = (record?.profileSnapshot.classes ?? profile?.classes ?? []).map((c) => c.key);
  const criteria = profile ? criteriaFor(profile) : [];
  const onLive = useCallback((f: LiveFrame | null) => setLiveFrame(f), []);

  return (
    <>
      {profiles.length > 1 ? (
        <ProductPicker
          profiles={profiles}
          value={profileId}
          disabled={busy}
          onChange={(id) => {
            setProfileId(id);
            if (record) clear();
          }}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div
          className="min-w-0"
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {showCamera ? (
            <LiveCamera profileId={profileId} disabled={busy} onCapture={(f) => void accept(f, "camera", true)} onLive={onLive} />
          ) : (
            <div className={cn("relative rounded-lg transition-shadow", dragOver && "ring-2 ring-ink ring-offset-2 ring-offset-canvas")}>
              <ImageViewer
                src={previewUrl}
                detections={record?.detections ?? []}
                classOrder={classOrder}
                highlight={highlight}
                showAnnotations={!!record}
                emptyLabel={
                  <span className="flex max-w-xs flex-col items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
                      <FileImage aria-hidden className="h-5 w-5 text-muted" strokeWidth={1.6} />
                    </span>
                    <span className="text-[14px] font-medium text-fg">Drop a photo of the {profile?.name.toLowerCase() ?? "part"} here</span>
                    <span className="text-[12.5px] text-subtle">JPEG, PNG or WebP up to {maxUploadMb} MB. Or switch to Live camera on the right.</span>
                  </span>
                }
              />
              {busy ? (
                <div aria-hidden className="pointer-events-none absolute inset-x-px bottom-[30px] top-[42px] overflow-hidden">
                  <div className="absolute inset-0 bg-black/15" />
                  <div className="scanline" />
                </div>
              ) : null}
              {dragOver ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-canvas/80 text-[14px] font-medium text-fg backdrop-blur-[1px]">
                  Release to load the image
                </div>
              ) : null}
            </div>
          )}
          {record ? (
            <div className="mt-2.5 px-1">
              <Legend record={record} classOrder={classOrder} />
            </div>
          ) : null}
        </div>

        <Panel className="flex min-w-0 flex-col self-start">
          <div className="space-y-4 p-4">
            {profile ? (
              <div>
                <p className="eyebrow mb-2">Pass criteria · {profile.name}</p>
                <ul className="space-y-1.5 text-[13px]">
                  {criteria.map((c) => (
                    <li key={c.text} className="flex items-start gap-2 text-fg">
                      <span
                        aria-hidden
                        className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-pass-wash text-pass" : "bg-reject-wash text-reject")}
                      >
                        {c.ok ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : <X className="h-2.5 w-2.5" strokeWidth={3.5} />}
                      </span>
                      {c.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-mono text-[11px] text-subtle">model {profile.modelId}</p>
              </div>
            ) : null}

            <div className="border-t border-line pt-4">
              <div role="tablist" aria-label="Image source" className="mb-3 grid grid-cols-2 rounded-md bg-raised p-0.5">
                {(
                  [
                    ["upload", "Upload photo", Upload],
                    ["camera", "Live camera", Camera],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    role="tab"
                    type="button"
                    id={`tab-${key}`}
                    aria-selected={tab === key}
                    aria-controls={`panel-${key}`}
                    disabled={busy}
                    onClick={() => {
                      setTab(key);
                      if (key === "camera") clear();
                    }}
                    className={cn(
                      "flex h-8 items-center justify-center gap-2 rounded-[4px] text-[13px] font-medium transition-colors",
                      tab === key ? "bg-panel text-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-muted hover:text-fg",
                    )}
                  >
                    <Icon aria-hidden className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "upload" ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-line-strong px-3 py-3">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ACCEPT_ATTR}
                      className="sr-only"
                      id="ws-file"
                      aria-label="Image file"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void accept(f, "upload");
                      }}
                    />
                    <p className="text-[12.5px] leading-snug text-subtle">
                      Drag onto the viewer, or
                      <br />
                      pick from disk · max {maxUploadMb} MB
                    </p>
                    <Button ref={chooseButton} size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                      <Upload aria-hidden className="h-3.5 w-3.5" /> Choose file
                    </Button>
                  </div>
                ) : file ? (
                  <Button size="sm" className="w-full" onClick={clear} disabled={busy}>
                    <Camera aria-hidden className="h-3.5 w-3.5" /> Back to live camera
                  </Button>
                ) : (
                  <p className="rounded-md bg-sunken px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
                    Live check runs on every frame and is <strong className="font-medium text-fg">not saved</strong>. Press <strong className="font-medium text-fg">Capture &amp; inspect</strong> to store a record.
                  </p>
                )}
              </div>

              {validation ? (
                <div className="mt-3">
                  <Notice tone="error" title="File not accepted">
                    {validation}
                  </Notice>
                </div>
              ) : null}

              {file ? (
                <div className="rise mt-3 flex items-center gap-3 rounded-md bg-sunken px-3 py-2">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL thumbnail
                    <img src={previewUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p className="truncate text-fg">{file.name}</p>
                    <p className="font-mono text-[11px] text-subtle">
                      {formatBytes(file.size)} · {source === "camera" ? "camera capture" : "upload"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clear}
                    disabled={busy}
                    aria-label="Clear image"
                    className="rounded p-1 text-subtle hover:bg-raised hover:text-fg disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 font-mono text-[11.5px] text-muted">
                <StatusDot tone={readiness === "ready" ? "ok" : readiness === "checking" ? "neutral" : readiness === "offline" ? "error" : "warn"} />
                {READINESS_LABEL[readiness]}
                {readiness !== "ready" && readiness !== "checking" ? <span className="text-subtle">· results will be REVIEW</span> : null}
              </div>

              {phase.name === "done" ? (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      clear();
                      if (source === "upload") fileInput.current?.click();
                    }}
                  >
                    <RotateCcw aria-hidden className="h-4 w-4" /> Next item
                  </Button>
                  <ButtonLink href={`/inspection/${phase.record.id}`}>Open record</ButtonLink>
                </div>
              ) : showCamera ? null : (
                <Button variant="primary" className="h-10 w-full" onClick={() => void run()} disabled={!file || !profileId || busy}>
                  {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />}
                  {phase.name === "uploading" ? `Uploading ${phase.pct}%` : phase.name === "analyzing" ? "Analysing…" : "Run inspection"}
                </Button>
              )}

              {busy ? (
                <div aria-live="polite" className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.name === "uploading" ? phase.pct : undefined} aria-label="Inspection progress">
                    <div
                      className={cn("h-full rounded-full bg-ink transition-all", phase.name === "analyzing" && "w-full animate-pulse")}
                      style={phase.name === "uploading" ? { width: `${phase.pct}%` } : undefined}
                    />
                  </div>
                  <ol className="mt-2 flex justify-between font-mono text-[11px] text-subtle">
                    <li className={phase.name === "uploading" ? "text-fg" : "text-muted"}>upload</li>
                    <li className={phase.name === "analyzing" ? "text-fg" : ""}>detect + check</li>
                    <li>decision</li>
                  </ol>
                </div>
              ) : null}

              {phase.name === "failed" ? (
                <div className="mt-3">
                  <Notice tone="error" title="Inspection not completed">
                    {phase.message}{" "}
                    <button type="button" className="text-accent underline" onClick={() => void run()}>
                      Retry
                    </button>
                  </Notice>
                </div>
              ) : null}
            </div>
          </div>

          {record ? (
            <div className="rise border-t border-line">
              <ResultPanel record={record} onHighlight={setHighlight} />
              <div className="flex flex-wrap gap-4 border-t border-line px-4 py-3">
                <Link href={`/inspection/${record.id}/report`} className="text-[12.5px] text-accent hover:underline">
                  Printable report →
                </Link>
                <a href={`/api/export?format=json&ids=${record.id}`} className="text-[12.5px] text-accent hover:underline">
                  Download JSON
                </a>
              </div>
            </div>
          ) : showCamera && liveFrame ? (
            <div className="border-t border-line">
              <p className="flex items-center gap-2 bg-sunken px-4 py-2 font-mono text-[11px] text-subtle">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-reject" /> live result · updates every frame · not saved
              </p>
              <ResultPanel record={liveFrame.record} compact live />
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
