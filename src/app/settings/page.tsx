import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { KeyValue, Panel, PanelHeader } from "@/components/ui/primitives";
import { maxUploadMb } from "@/lib/api";
import { dataDir, getDb } from "@/lib/db";
import { listProfiles } from "@/lib/db/profiles";
import { getSettings } from "@/lib/db/settings";
import { inferenceUrl } from "@/lib/inference/client";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = getSettings();
  const profiles = listProfiles().map(({ id, name }) => ({ id, name }));
  const storedImages = (getDb().prepare("SELECT COUNT(*) AS n FROM inspections WHERE image_path IS NOT NULL").get() as { n: number }).n;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <SettingsForm initial={settings} profiles={profiles} storedImages={storedImages} />
      <Panel className="self-start">
        <PanelHeader title="Server configuration" description="Set through environment variables; read-only here" />
        <div className="space-y-3 p-4">
          <KeyValue
            items={[
              ["Inference endpoint (INFERENCE_URL)", <code key="u" className="text-xs">{inferenceUrl()}</code>],
              ["Upload limit (VI_MAX_UPLOAD_MB)", `${maxUploadMb()} MB`],
              ["Data directory (VI_DATA_DIR)", <code key="d" className="break-all text-xs">{dataDir()}</code>],
              ["Database", "SQLite (visioninspect.sqlite3)"],
              ["Authentication", "None — run on a trusted network only"],
            ]}
          />
          <p className="text-xs text-subtle">
            Change these in <code>.env.local</code> and restart the server. The browser never calls the inference service directly; all
            requests go through this web server.
          </p>
        </div>
      </Panel>
    </div>
  );
}
