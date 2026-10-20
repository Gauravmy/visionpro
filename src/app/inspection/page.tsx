import type { Metadata } from "next";
import { InspectionWorkspace } from "@/components/inspection/InspectionWorkspace";
import { maxUploadMb } from "@/lib/api";
import { listProfiles } from "@/lib/db/profiles";
import { getSettings } from "@/lib/db/settings";

export const metadata: Metadata = { title: "New inspection" };
export const dynamic = "force-dynamic";

export default async function InspectionPage({ searchParams }: { searchParams: Promise<{ source?: string; profile?: string }> }) {
  const { source, profile } = await searchParams;
  // Product categories (profiles with a required product) first, in their seeded order.
  const order = ["qc-bottle", "qc-charger", "qc-marker"];
  const rank = (p: { id: string; classes: Array<{ role?: string }> }) =>
    order.includes(p.id) ? order.indexOf(p.id) : p.classes.some((c) => c.role === "required") ? order.length : order.length + 1;
  const profiles = listProfiles()
    .map(({ id, name, code, classes, modelId, quality }) => ({ id, name, code, classes, modelId, quality }))
    .sort((a, b) => rank(a) - rank(b));
  const settings = getSettings();
  return (
    <InspectionWorkspace
      profiles={profiles}
      activeProfileId={profile && profiles.some((p) => p.id === profile) ? profile : settings.activeProfileId}
      initialSource={source === "camera" ? "camera" : "upload"}
      focusUpload={source === "upload"}
      maxUploadMb={maxUploadMb()}
    />
  );
}
