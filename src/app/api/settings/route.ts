import { NextResponse } from "next/server";
import { apiError, crossOriginRejection, readJson } from "@/lib/api";
import { getProfile } from "@/lib/db/profiles";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { applyRetention } from "@/lib/services/retention";
import { formatZodError, settingsInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSettings());
}

/** PUT accepts a partial settings object; unspecified keys keep their current values. */
export async function PUT(req: Request) {
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (!body || typeof body !== "object") return apiError(400, "INVALID_REQUEST", "Expected a JSON object.");
  const parsed = settingsInputSchema.safeParse({ ...getSettings(), ...(body as object) });
  if (!parsed.success) return apiError(422, "INVALID_SETTINGS", formatZodError(parsed.error));
  if (parsed.data.activeProfileId && !getProfile(parsed.data.activeProfileId)) {
    return apiError(422, "INVALID_SETTINGS", "activeProfileId does not match an existing profile.");
  }
  return NextResponse.json(saveSettings(parsed.data));
}

/** POST /api/settings?action=apply-retention removes stored images older than the retention window now. */
export async function POST(req: Request) {
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;
  if (new URL(req.url).searchParams.get("action") !== "apply-retention") {
    return apiError(400, "UNKNOWN_ACTION", "Unsupported action.");
  }
  const settings = getSettings();
  if (!settings.retentionDays) return apiError(409, "NO_RETENTION_WINDOW", "Set a retention period first.");
  const removed = await applyRetention(settings);
  return NextResponse.json({ removed });
}
