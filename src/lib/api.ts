import "server-only";
import { NextResponse } from "next/server";
import type { ApiErrorBody } from "./types";

export function apiError(status: number, code: string, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return NextResponse.json(body, { status });
}

/**
 * Reject cross-site requests to mutating endpoints. The app has no authentication,
 * so this keeps other origins from triggering deletes or uploads through the browser.
 */
export function crossOriginRejection(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    // fall through
  }
  return apiError(403, "CROSS_ORIGIN", "Cross-origin requests are not allowed.");
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function maxUploadMb(): number {
  const n = Number(process.env.VI_MAX_UPLOAD_MB);
  return Number.isFinite(n) && n > 0 ? n : 10;
}
