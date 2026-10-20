import { NextResponse } from "next/server";
import { apiError, crossOriginRejection, readJson } from "@/lib/api";
import { createProfile, listProfiles, ProfileConflictError } from "@/lib/db/profiles";
import { formatZodError, profileInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listProfiles());
}

export async function POST(req: Request) {
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;
  const parsed = profileInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(422, "INVALID_PROFILE", formatZodError(parsed.error), parsed.error.flatten());
  try {
    return NextResponse.json(createProfile(parsed.data), { status: 201 });
  } catch (err) {
    if (err instanceof ProfileConflictError) return apiError(409, "DUPLICATE_CODE", err.message);
    throw err;
  }
}
