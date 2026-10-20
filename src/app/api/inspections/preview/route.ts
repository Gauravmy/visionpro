import { NextResponse } from "next/server";
import { apiError, crossOriginRejection, maxUploadMb } from "@/lib/api";
import { InspectionInputError, runInspection } from "@/lib/services/inspect";
import { checkFileMeta, sniffImageMime } from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live camera preview: same analysis and decision as POST /api/inspections, but nothing is stored. */
export async function POST(req: Request) {
  const started = performance.now();
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Expected multipart/form-data with an image field.");
  }
  const file = form.get("image");
  const profileId = form.get("profileId");
  if (!(file instanceof File)) return apiError(400, "MISSING_IMAGE", "No image file was provided.");
  if (typeof profileId !== "string" || !profileId) return apiError(400, "MISSING_PROFILE", "A product profile is required.");

  const meta = checkFileMeta(file, maxUploadMb());
  if (!meta.ok) return apiError(meta.code === "FILE_TOO_LARGE" ? 413 : 415, meta.code, meta.message);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) return apiError(415, "UNSUPPORTED_TYPE", "File contents are not a JPEG, PNG or WebP image.");

  try {
    const record = await runInspection({ bytes, mime, originalFilename: null, source: "camera", profileId }, started, false);
    return NextResponse.json(record);
  } catch (err) {
    if (err instanceof InspectionInputError) return apiError(err.status, err.code, err.message);
    console.error("Live preview failed", err);
    return apiError(500, "INSPECTION_FAILED", "The live analysis failed. Check the server log.");
  }
}
