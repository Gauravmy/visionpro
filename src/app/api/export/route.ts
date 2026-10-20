import { apiError } from "@/lib/api";
import { listRecords } from "@/lib/db/inspections";
import { getSettings } from "@/lib/db/settings";
import { inspectionsToCsv, inspectionsToJson } from "@/lib/export";
import { formatZodError, parseInspectionQuery } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT = 5000;

/**
 * GET /api/export?format=csv|json&from=&to=&profileId=&decision=&classKey=&q=&ids=a,b
 * Exports exactly the records matching the given filters (or ids). Returns 404 when none match.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const settings = getSettings();
  const format = sp.get("format") ?? settings.exportFormat;
  if (format !== "csv" && format !== "json") return apiError(400, "INVALID_FORMAT", "format must be csv or json.");
  const raw = Object.fromEntries(sp.entries());
  delete raw.format;
  const parsed = parseInspectionQuery(raw);
  if (!parsed.success) return apiError(400, "INVALID_QUERY", formatZodError(parsed.error));
  const q = parsed.data;
  if (q.from && q.to && q.from > q.to) return apiError(400, "INVALID_RANGE", "The start date is after the end date.");

  const records = listRecords(q, MAX_EXPORT + 1);
  if (records.length === 0) return apiError(404, "NO_RECORDS", "No inspection records match the selected filters.");
  if (records.length > MAX_EXPORT) {
    return apiError(413, "TOO_MANY_RECORDS", `More than ${MAX_EXPORT} records match. Narrow the date range.`);
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filters = { from: q.from ?? null, to: q.to ?? null, profileId: q.profileId ?? null, decision: q.decision ?? null, classKey: q.classKey ?? null, ids: q.ids ?? null };
  const body =
    format === "csv" ? inspectionsToCsv(records, settings.csvIncludeBoxes) : inspectionsToJson(records, { filters });
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="visioninspect-${stamp}.${format}"`,
      "X-Record-Count": String(records.length),
    },
  });
}
