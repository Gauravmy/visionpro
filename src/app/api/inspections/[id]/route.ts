import { NextResponse } from "next/server";
import { apiError, crossOriginRejection } from "@/lib/api";
import { logEvent } from "@/lib/db/events";
import { deleteInspection, getInspection } from "@/lib/db/inspections";
import { deleteImage } from "@/lib/storage/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const found = getInspection(id);
  if (!found) return apiError(404, "NOT_FOUND", `Inspection ${id} was not found.`);
  return NextResponse.json(found.record);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const blocked = crossOriginRejection(req);
  if (blocked) return blocked;
  const { id } = await params;
  const removed = deleteInspection(id);
  if (!removed) return apiError(404, "NOT_FOUND", `Inspection ${id} was not found.`);
  await deleteImage(removed.imagePath);
  logEvent("inspection", `${id} deleted.`, null);
  return NextResponse.json({ deleted: id });
}
