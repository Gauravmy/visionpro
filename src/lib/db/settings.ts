import "server-only";
import type Database from "better-sqlite3";
import type { AppSettings } from "../types";
import { getDb } from "./index";
import { logEvent } from "./events";

export const DEFAULT_SETTINGS: AppSettings = {
  activeProfileId: null,
  retainImages: true,
  retentionDays: null,
  exportFormat: "csv",
  csvIncludeBoxes: false,
};

export function getSettings(db: Database.Database = getDb()): AppSettings {
  const rows = db.prepare("SELECT key, value_json FROM settings").all() as Array<{ key: string; value_json: string }>;
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value_json)]));
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in stored) merged[key] = stored[key];
  }
  const settings = merged as unknown as AppSettings;
  // Fall back to the first profile if the active one was removed.
  if (!settings.activeProfileId || !db.prepare("SELECT 1 FROM profiles WHERE id = ?").get(settings.activeProfileId)) {
    const first = db.prepare("SELECT id FROM profiles ORDER BY name COLLATE NOCASE LIMIT 1").get() as { id: string } | undefined;
    settings.activeProfileId = first?.id ?? null;
  }
  return settings;
}

export function saveSettings(next: AppSettings, db: Database.Database = getDb()): AppSettings {
  const before = getSettings(db);
  const upsert = db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(next)) upsert.run(k, JSON.stringify(v));
  })();
  const changed = (Object.keys(next) as Array<keyof AppSettings>).filter((k) => before[k] !== next[k]);
  if (changed.length) logEvent("settings", `Settings changed: ${changed.join(", ")}.`, null, db);
  return getSettings(db);
}
