import "server-only";
import { healthResponseSchema, parseAnalyzeResponse, type HealthResponse, type ParsedAnalysis } from "./schemas";

export function inferenceUrl(): string {
  return (process.env.INFERENCE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function timeoutMs(): number {
  const n = Number(process.env.INFERENCE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30000;
}

export class InferenceError extends Error {
  constructor(
    public readonly kind: "unreachable" | "timeout" | "rejected" | "bad_response",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

async function call(path: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetch(`${inferenceUrl()}${path}`, { ...init, signal: AbortSignal.timeout(ms), cache: "no-store" });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new InferenceError("timeout", `Inference service did not respond within ${Math.round(ms / 1000)} s.`);
    }
    throw new InferenceError("unreachable", "Inference service is unreachable.");
  }
}

/** Model input size for live preview frames: about 1.7x faster than 640 on CPU. Stored inspections use the service default. */
export function liveImgsz(): number {
  const n = Number(process.env.INFERENCE_LIVE_IMGSZ);
  return Number.isInteger(n) && n >= 160 && n <= 1280 && n % 32 === 0 ? n : 480;
}

/**
 * Live preview passes thorough=false (skips the zoomed-out second pass) and a smaller imgsz;
 * stored inspections use the defaults.
 */
export async function analyzeImage(
  bytes: Buffer,
  mime: string,
  conf: number,
  opts: { thorough?: boolean; imgsz?: number } = {},
): Promise<ParsedAnalysis> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mime }), "upload");
  form.append("conf", conf.toFixed(4));
  form.append("thorough", opts.thorough === false ? "false" : "true");
  if (opts.imgsz) form.append("imgsz", String(opts.imgsz));
  const res = await call("/api/analyze", { method: "POST", body: form }, timeoutMs());
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message ?? `Service returned HTTP ${res.status}.`;
    throw new InferenceError("rejected", message, res.status);
  }
  try {
    return parseAnalyzeResponse(json);
  } catch {
    throw new InferenceError("bad_response", "Inference service returned an unexpected response.");
  }
}

export type BackendHealth =
  | { reachable: true; checkedAt: string; latencyMs: number; health: HealthResponse }
  | { reachable: false; checkedAt: string; message: string };

export async function checkHealth(): Promise<BackendHealth> {
  const checkedAt = new Date().toISOString();
  const started = performance.now();
  try {
    const res = await call("/health", { method: "GET" }, 5000);
    if (!res.ok) return { reachable: false, checkedAt, message: `Health check returned HTTP ${res.status}.` };
    const parsed = healthResponseSchema.safeParse(await res.json());
    if (!parsed.success) return { reachable: false, checkedAt, message: "Health response did not match the expected contract." };
    return { reachable: true, checkedAt, latencyMs: Math.round(performance.now() - started), health: parsed.data };
  } catch (err) {
    return { reachable: false, checkedAt, message: err instanceof Error ? err.message : "Health check failed." };
  }
}
