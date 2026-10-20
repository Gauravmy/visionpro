import "server-only";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ProductProfile } from "../types";
import type { ProfileInput } from "../validation";
import { getDb } from "./index";
import { logEvent } from "./events";

interface ProfileRow {
  id: string;
  name: string;
  code: string;
  domain: string;
  model_id: string;
  notes: string;
  auto_pass_enabled: number;
  classes_json: string;
  quality_json: string;
  created_at: string;
  updated_at: string;
}

function toProfile(r: ProfileRow): ProductProfile {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    domain: r.domain,
    modelId: r.model_id,
    notes: r.notes,
    autoPassEnabled: r.auto_pass_enabled === 1,
    classes: JSON.parse(r.classes_json),
    quality: JSON.parse(r.quality_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listProfiles(db: Database.Database = getDb()): ProductProfile[] {
  return (db.prepare("SELECT * FROM profiles ORDER BY name COLLATE NOCASE").all() as ProfileRow[]).map(toProfile);
}

export function getProfile(id: string, db: Database.Database = getDb()): ProductProfile | null {
  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined;
  return row ? toProfile(row) : null;
}

export class ProfileConflictError extends Error {}

function codeTaken(db: Database.Database, code: string, exceptId?: string): boolean {
  const row = db.prepare("SELECT id FROM profiles WHERE code = ? COLLATE NOCASE").get(code) as { id: string } | undefined;
  return !!row && row.id !== exceptId;
}

export function createProfile(input: ProfileInput, db: Database.Database = getDb()): ProductProfile {
  if (codeTaken(db, input.code)) throw new ProfileConflictError(`Product ID "${input.code}" is already in use.`);
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO profiles (id, name, code, domain, model_id, notes, auto_pass_enabled, classes_json, quality_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.code, input.domain, input.modelId, input.notes, input.autoPassEnabled ? 1 : 0, JSON.stringify(input.classes), JSON.stringify(input.quality), now, now);
  logEvent("profile", `Product profile "${input.name}" created.`, null, db);
  return getProfile(id, db)!;
}

export function updateProfile(id: string, input: ProfileInput, db: Database.Database = getDb()): ProductProfile | null {
  if (!getProfile(id, db)) return null;
  if (codeTaken(db, input.code, id)) throw new ProfileConflictError(`Product ID "${input.code}" is already in use.`);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE profiles SET name = ?, code = ?, domain = ?, model_id = ?, notes = ?, auto_pass_enabled = ?, classes_json = ?, quality_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(input.name, input.code, input.domain, input.modelId, input.notes, input.autoPassEnabled ? 1 : 0, JSON.stringify(input.classes), JSON.stringify(input.quality), now, id);
  logEvent("profile", `Product profile "${input.name}" updated.`, null, db);
  return getProfile(id, db);
}

/** Profiles can be removed only if at least one other remains. Past inspections keep their own profile snapshot. */
export function deleteProfile(id: string, db: Database.Database = getDb()): "deleted" | "not_found" | "last_profile" {
  const p = getProfile(id, db);
  if (!p) return "not_found";
  const count = (db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n;
  if (count <= 1) return "last_profile";
  db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  logEvent("profile", `Product profile "${p.name}" deleted.`, null, db);
  return "deleted";
}
