import { NextResponse } from "next/server";
import { apiError, crossOriginRejection, readJson } from "@/lib/api";
import { deleteProfile, getProfile, ProfileConflictError, updateProfile } from "@/lib/db/profiles";
import { formatZodError, profileInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const p = getProfile(id);
  return p ? NextResponse.json(p) : apiError(404, "NOT_FOUND", "Profile not found.");
}

export async function PUT(req: Request, { params }: Ctx) {
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;
  const { id } = await params;
  const parsed = profileInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(422, "INVALID_PROFILE", formatZodError(parsed.error), parsed.error.flatten());
  try {
    const updated = updateProfile(id, parsed.data);
    return updated ? NextResponse.json(updated) : apiError(404, "NOT_FOUND", "Profile not found.");
  } catch (err) {
    if (err instanceof ProfileConflictError) return apiError(409, "DUPLICATE_CODE", err.message);
    throw err;
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;
  const { id } = await params;
  const result = deleteProfile(id);
  if (result === "not_found") return apiError(404, "NOT_FOUND", "Profile not found.");
  if (result === "last_profile") return apiError(409, "LAST_PROFILE", "At least one product profile must remain.");
  return NextResponse.json({ deleted: id });
}
