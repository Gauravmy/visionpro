import { NextResponse } from "next/server";
import { checkHealth, inferenceUrl } from "@/lib/inference/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxies the inference service health check so the browser never needs the service URL directly. */
export async function GET() {
  const result = await checkHealth();
  return NextResponse.json({ ...result, endpoint: inferenceUrl() });
}
