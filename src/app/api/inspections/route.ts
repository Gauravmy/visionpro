import { NextResponse } from "next/server";
import { apiError, crossOriginRejection, maxUploadMb } from "@/lib/api";
import { queryInspections } from "@/lib/db/inspections";
import { InspectionInputError, runInspection } from "@/lib/services/inspect";
import { checkFileMeta, safeDisplayName, sniffImageMime } from "@/lib/upload";
import { formatZodError, parseInspectionQuery } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseInspectionQuery(params);
  if (!parsed.success) return apiError(400, "INVALID_QUERY", formatZodError(parsed.error));
  return NextResponse.json(queryInspections(parsed.data));
}

export async function POST(req: Request) {
  const started = performance.now();
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;

  const limitMb = maxUploadMb();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limitMb * 1024 * 1024 + 64 * 1024) {
    return apiError(413, "FILE_TOO_LARGE", `Upload exceeds the ${limitMb} MB limit.`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Expected multipart/form-data with an image field.");
  }
  const file = form.get("image");
  const profileId = form.get("profileId");
  const source = form.get("source") === "camera" ? "camera" : "upload";
  if (!(file instanceof File)) return apiError(400, "MISSING_IMAGE", "No image file was provided.");
  if (typeof profileId !== "string" || !profileId) return apiError(400, "MISSING_PROFILE", "A product profile is required.");

  const meta = checkFileMeta(file, limitMb);
  if (!meta.ok) return apiError(meta.code === "FILE_TOO_LARGE" ? 413 : 415, meta.code, meta.message);

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) return apiError(415, "UNSUPPORTED_TYPE", "File contents are not a JPEG, PNG or WebP image.");

  try {
    const record = await runInspection(
      { bytes, mime, originalFilename: safeDisplayName(file.name), source, profileId },
      started,
    );
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    if (err instanceof InspectionInputError) return apiError(err.status, err.code, err.message);
    console.error("Inspection failed", err);
    return apiError(500, "INSPECTION_FAILED", "The inspection could not be completed. Check the server log.");
  }
}
