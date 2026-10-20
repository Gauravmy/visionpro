import { apiError } from "@/lib/api";
import { getInspection } from "@/lib/db/inspections";
import { readImage } from "@/lib/storage/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = getInspection(id);
  if (!found) return apiError(404, "NOT_FOUND", "Inspection not found.");
  if (!found.imagePath) return apiError(410, "IMAGE_NOT_RETAINED", "The image for this inspection is no longer stored.");
  const bytes = await readImage(found.imagePath);
  if (!bytes) return apiError(410, "IMAGE_MISSING", "The stored image file could not be found.");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": found.record.imageMime ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
