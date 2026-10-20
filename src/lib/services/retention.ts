import "server-only";
import { logEvent } from "../db/events";
import { detachImagesBefore } from "../db/inspections";
import { deleteImage } from "../storage/files";
import type { AppSettings } from "../types";

/** Remove stored images older than the configured retention window. Inspection records are kept. */
export async function applyRetention(settings: Pick<AppSettings, "retentionDays">): Promise<number> {
  if (!settings.retentionDays) return 0;
  const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000).toISOString();
  const paths = detachImagesBefore(cutoff);
  await Promise.all(paths.map((p) => deleteImage(p)));
  if (paths.length) logEvent("retention", `Removed ${paths.length} stored image(s) older than ${settings.retentionDays} days.`);
  return paths.length;
}
