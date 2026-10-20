"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import type { AppSettings } from "@/lib/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Field, Input, Select, Switch } from "../ui/form";
import { Button, Notice, Panel, PanelHeader } from "../ui/primitives";

export function SettingsForm({ initial, profiles, storedImages }: { initial: AppSettings; profiles: Array<{ id: string; name: string }>; storedImages: number }) {
  const router = useRouter();
  const [s, setS] = useState<AppSettings>(initial);
  const [retentionText, setRetentionText] = useState(initial.retentionDays ? String(initial.retentionDays) : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  const retentionValid = retentionText === "" || (/^\d+$/.test(retentionText) && Number(retentionText) >= 1 && Number(retentionText) <= 3650);
  const dirty = JSON.stringify({ ...s, retentionDays: retentionText ? Number(retentionText) : null }) !== JSON.stringify(initial);

  const save = async () => {
    if (!retentionValid) return;
    setSaving(true);
    setMessage(null);
    const body = { ...s, retentionDays: retentionText ? Number(retentionText) : null };
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage({ tone: "error", text: json?.error?.message ?? "Settings were not saved." });
      return;
    }
    setMessage({ tone: "info", text: "Settings saved." });
    router.refresh();
  };

  const purge = async () => {
    setPurging(true);
    const res = await fetch("/api/settings?action=apply-retention", { method: "POST" });
    const json = await res.json().catch(() => null);
    setPurging(false);
    setConfirmPurge(false);
    setMessage(res.ok ? { tone: "info", text: `Removed ${json.removed} stored image(s).` } : { tone: "error", text: json?.error?.message ?? "Retention could not be applied." });
    router.refresh();
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Panel>
        <PanelHeader title="Inspection defaults" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Default (active) product profile" htmlFor="s-profile" hint="Pre-selected in the inspection workspace and shown in the header">
            <Select id="s-profile" value={s.activeProfileId ?? ""} onChange={(e) => setS({ ...s, activeProfileId: e.target.value })}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Image retention" description={`${storedImages} image(s) currently stored on this server`} />
        <div className="space-y-4 p-4">
          <Switch
            id="s-retain"
            checked={s.retainImages}
            onChange={(v) => setS({ ...s, retainImages: v })}
            label="Store inspection images"
            description="When off, new inspections keep only their results; images are discarded after analysis and cannot be reopened."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Delete stored images after (days)"
              htmlFor="s-days"
              error={retentionValid ? null : "Enter a whole number from 1 to 3650, or leave empty"}
              hint="Leave empty to keep images indefinitely. Records are kept; only image files are removed. Applied after each inspection."
            >
              <Input id="s-days" inputMode="numeric" value={retentionText} onChange={(e) => setRetentionText(e.target.value.trim())} aria-invalid={!retentionValid} placeholder="Keep indefinitely" />
            </Field>
            <div className="flex items-end">
              <Button variant="danger" size="sm" onClick={() => setConfirmPurge(true)} disabled={!initial.retentionDays || dirty}>
                <Trash2 aria-hidden className="h-3.5 w-3.5" /> Apply retention now
              </Button>
            </div>
          </div>
          {dirty && initial.retentionDays ? <p className="text-xs text-subtle">Save changes before applying retention.</p> : null}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Export preferences" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Default export format" htmlFor="s-format" hint="Used by the dashboard export action">
            <Select id="s-format" value={s.exportFormat} onChange={(e) => setS({ ...s, exportFormat: e.target.value as "csv" | "json" })}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Switch
              id="s-boxes"
              checked={s.csvIncludeBoxes}
              onChange={(v) => setS({ ...s, csvIncludeBoxes: v })}
              label="Include bounding boxes in CSV"
              description="Adds a detections column (class:score:outcome:[x1 y1 x2 y2])"
            />
          </div>
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={saving || !dirty || !retentionValid}>
          <Save aria-hidden className="h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <ConfirmDialog open={confirmPurge} title="Delete old images now?" confirmLabel="Delete images" busy={purging} onCancel={() => setConfirmPurge(false)} onConfirm={purge}>
        Stored images older than {initial.retentionDays} days will be permanently deleted. Inspection records and detections are kept.
      </ConfirmDialog>
    </form>
  );
}
