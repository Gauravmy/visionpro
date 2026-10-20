import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { defaultCategoryProfiles, defaultSteelProfile } from "../profiles/defaults";

export function dataDir(): string {
  return path.resolve(process.env.VI_DATA_DIR || path.join(process.cwd(), "data"));
}

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    model_id TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    auto_pass_enabled INTEGER NOT NULL,
    classes_json TEXT NOT NULL,
    quality_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE inspections (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    profile_snapshot_json TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('PASS','REJECT','REVIEW')),
    defect_count INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('upload','camera')),
    original_filename TEXT,
    image_path TEXT,
    image_mime TEXT,
    image_width INTEGER,
    image_height INTEGER,
    image_bytes INTEGER,
    model_id TEXT,
    model_version TEXT,
    detector_status TEXT NOT NULL,
    quality_json TEXT NOT NULL,
    reasons_json TEXT NOT NULL,
    timings_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    total_ms REAL NOT NULL
  );
  CREATE INDEX idx_inspections_created ON inspections(created_at);
  CREATE INDEX idx_inspections_profile ON inspections(profile_id);
  CREATE INDEX idx_inspections_decision ON inspections(decision);

  CREATE TABLE detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    class_key TEXT NOT NULL,
    confidence REAL NOT NULL,
    x1 REAL NOT NULL, y1 REAL NOT NULL, x2 REAL NOT NULL, y2 REAL NOT NULL,
    outcome TEXT NOT NULL
  );
  CREATE INDEX idx_detections_inspection ON detections(inspection_id);
  CREATE INDEX idx_detections_class ON detections(class_key);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    inspection_id TEXT
  );
  CREATE INDEX idx_events_created ON events(created_at);
  `,
];

function migrate(db: Database.Database) {
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

function seed(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n;
  if (count > 0) return;
  const now = new Date().toISOString();
  const p = defaultSteelProfile(now);
  db.prepare(
    `INSERT INTO profiles (id, name, code, domain, model_id, notes, auto_pass_enabled, classes_json, quality_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(p.id, p.name, p.code, p.domain, p.modelId, p.notes, p.autoPassEnabled ? 1 : 0, JSON.stringify(p.classes), JSON.stringify(p.quality), now, now);
  db.prepare("INSERT OR IGNORE INTO settings (key, value_json) VALUES ('activeProfileId', ?)").run(JSON.stringify(p.id));
  db.prepare("INSERT INTO events (created_at, type, message) VALUES (?, 'system', ?)").run(
    now,
    `Database initialised with default profile "${p.name}".`,
  );
}

/** Adds the Bottle / Charger / Marker profiles once; a user who deletes them later does not get them back. */
function seedCategoryProfiles(db: Database.Database) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'seededCategoryProfiles'").get()) return;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO profiles (id, name, code, domain, model_id, notes, auto_pass_enabled, classes_json, quality_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const p of defaultCategoryProfiles(now)) {
      insert.run(p.id, p.name, p.code, p.domain, p.modelId, p.notes, p.autoPassEnabled ? 1 : 0, JSON.stringify(p.classes), JSON.stringify(p.quality), now, now);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value_json) VALUES ('activeProfileId', ?)").run(JSON.stringify("qc-bottle"));
    db.prepare("INSERT INTO settings (key, value_json) VALUES ('seededCategoryProfiles', 'true')").run();
    db.prepare("INSERT INTO events (created_at, type, message) VALUES (?, 'system', ?)").run(now, "Added Bottle, Charger and Marker inspection profiles.");
  })();
}

/**
 * v3 of the category profiles (mobile charger wording, detector v2 classes, product-photo quality limits). Rewrites the
 * three seeded profiles once if they still exist; past inspections keep their own snapshot.
 */
function upgradeCategoryProfiles(db: Database.Database) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'categoryProfilesV3'").get()) return;
  const now = new Date().toISOString();
  const update = db.prepare(
    "UPDATE profiles SET name = ?, domain = ?, model_id = ?, notes = ?, classes_json = ?, quality_json = ?, updated_at = ? WHERE id = ?",
  );
  db.transaction(() => {
    for (const p of defaultCategoryProfiles(now)) {
      update.run(p.name, p.domain, p.modelId, p.notes, JSON.stringify(p.classes), JSON.stringify(p.quality), now, p.id);
    }
    db.prepare("INSERT INTO settings (key, value_json) VALUES ('categoryProfilesV3', 'true')").run();
    db.prepare("INSERT INTO events (created_at, type, message) VALUES (?, 'system', ?)").run(now, "Updated Bottle, Mobile charger and Marker profiles for detector v2.");
  })();
}

export function openDatabase(file: string): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  seedCategoryProfiles(db);
  upgradeCategoryProfiles(db);
  return db;
}

const globalForDb = globalThis as unknown as { __viDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__viDb) {
    globalForDb.__viDb = openDatabase(path.join(dataDir(), "visioninspect.sqlite3"));
  }
  return globalForDb.__viDb;
}
