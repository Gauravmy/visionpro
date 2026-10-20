import "server-only";
import type Database from "better-sqlite3";
import type { EvaluatedDetection, InspectionRecord, InspectionSummary } from "../types";
import type { InspectionQuery } from "../validation";
import { getDb } from "./index";

/** Detections that count as defects: those that triggered REJECT or REVIEW. */
export const ACTIONABLE_OUTCOMES = ["reject", "review"] as const;
const ACTIONABLE_SQL = `('reject','review')`;

interface InspectionRow {
  id: string;
  created_at: string;
  profile_id: string;
  profile_name: string;
  profile_snapshot_json: string;
  decision: InspectionRecord["decision"];
  defect_count: number;
  source: InspectionRecord["source"];
  original_filename: string | null;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  image_bytes: number | null;
  model_id: string | null;
  model_version: string | null;
  detector_status: InspectionRecord["detectorStatus"];
  quality_json: string;
  reasons_json: string;
  timings_json: string;
  warnings_json: string;
  total_ms: number;
}

interface DetectionRow {
  idx: number;
  class_id: number;
  class_name: string;
  class_key: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  outcome: EvaluatedDetection["outcome"];
}

export function insertInspection(rec: InspectionRecord, imagePath: string | null, db: Database.Database = getDb()) {
  const insert = db.prepare(`
    INSERT INTO inspections (id, created_at, profile_id, profile_name, profile_snapshot_json, decision, defect_count, source,
      original_filename, image_path, image_mime, image_width, image_height, image_bytes, model_id, model_version,
      detector_status, quality_json, reasons_json, timings_json, warnings_json, total_ms)
    VALUES (@id, @createdAt, @profileId, @profileName, @snapshot, @decision, @defectCount, @source,
      @originalFilename, @imagePath, @imageMime, @imageWidth, @imageHeight, @imageBytes, @modelId, @modelVersion,
      @detectorStatus, @quality, @reasons, @timings, @warnings, @totalMs)`);
  const insertDet = db.prepare(`
    INSERT INTO detections (inspection_id, idx, class_id, class_name, class_key, confidence, x1, y1, x2, y2, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    insert.run({
      id: rec.id,
      createdAt: rec.createdAt,
      profileId: rec.profileId,
      profileName: rec.profileName,
      snapshot: JSON.stringify(rec.profileSnapshot),
      decision: rec.decision,
      defectCount: rec.defectCount,
      source: rec.source,
      originalFilename: rec.originalFilename,
      imagePath,
      imageMime: rec.imageMime,
      imageWidth: rec.imageWidth,
      imageHeight: rec.imageHeight,
      imageBytes: rec.imageBytes,
      modelId: rec.modelId,
      modelVersion: rec.modelVersion,
      detectorStatus: rec.detectorStatus,
      quality: JSON.stringify(rec.quality),
      reasons: JSON.stringify(rec.reasons),
      timings: JSON.stringify(rec.timings),
      warnings: JSON.stringify(rec.warnings),
      totalMs: rec.timings.totalMs,
    });
    rec.detections.forEach((d, i) =>
      insertDet.run(rec.id, i, d.classId, d.className, d.classKey, d.confidence, d.box.x1, d.box.y1, d.box.x2, d.box.y2, d.outcome),
    );
  })();
}

function toRecord(row: InspectionRow, dets: DetectionRow[]): InspectionRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    profileId: row.profile_id,
    profileName: row.profile_name,
    profileSnapshot: JSON.parse(row.profile_snapshot_json),
    decision: row.decision,
    defectCount: row.defect_count,
    source: row.source,
    originalFilename: row.original_filename,
    imageAvailable: row.image_path !== null,
    imageMime: row.image_mime,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    imageBytes: row.image_bytes,
    modelId: row.model_id,
    modelVersion: row.model_version,
    detectorStatus: row.detector_status,
    quality: JSON.parse(row.quality_json),
    detections: dets.map((d) => ({
      classId: d.class_id,
      className: d.class_name,
      classKey: d.class_key,
      confidence: d.confidence,
      box: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 },
      outcome: d.outcome,
    })),
    reasons: JSON.parse(row.reasons_json),
    timings: JSON.parse(row.timings_json),
    warnings: JSON.parse(row.warnings_json),
  };
}

export function getInspection(id: string, db: Database.Database = getDb()): { record: InspectionRecord; imagePath: string | null } | null {
  const row = db.prepare("SELECT * FROM inspections WHERE id = ?").get(id) as InspectionRow | undefined;
  if (!row) return null;
  const dets = db.prepare("SELECT * FROM detections WHERE inspection_id = ? ORDER BY idx").all(id) as DetectionRow[];
  return { record: toRecord(row, dets), imagePath: row.image_path };
}

/** Convert a YYYY-MM-DD local date to the ISO instant of local midnight. */
export function localDayStartIso(day: string, offsetDays = 0): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d + offsetDays).toISOString();
}

type Filters = Pick<InspectionQuery, "q" | "from" | "to" | "profileId" | "classKey" | "decision" | "ids">;

export function buildWhere(f: Filters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    clauses.push("i.id LIKE ? ESCAPE '\\'");
    params.push(`%${f.q.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (f.from) {
    clauses.push("i.created_at >= ?");
    params.push(localDayStartIso(f.from));
  }
  if (f.to) {
    clauses.push("i.created_at < ?");
    params.push(localDayStartIso(f.to, 1));
  }
  if (f.profileId) {
    clauses.push("i.profile_id = ?");
    params.push(f.profileId);
  }
  if (f.decision) {
    clauses.push("i.decision = ?");
    params.push(f.decision);
  }
  if (f.classKey) {
    clauses.push(`EXISTS (SELECT 1 FROM detections d WHERE d.inspection_id = i.id AND d.class_key = ? AND d.outcome IN ${ACTIONABLE_SQL})`);
    params.push(f.classKey);
  }
  if (f.ids?.length) {
    clauses.push(`i.id IN (${f.ids.map(() => "?").join(",")})`);
    params.push(...f.ids);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const SORT_SQL: Record<InspectionQuery["sort"], string> = {
  createdAt: "i.created_at",
  decision: "i.decision",
  defectCount: "i.defect_count",
  profileName: "i.profile_name COLLATE NOCASE",
};

interface SummaryRow {
  id: string;
  created_at: string;
  profile_id: string;
  profile_name: string;
  decision: InspectionSummary["decision"];
  defect_count: number;
  model_id: string | null;
  detector_status: string;
  has_image: number;
  total_ms: number;
  classes: string | null;
  max_conf: number | null;
}

const SUMMARY_SELECT = `
  SELECT i.id, i.created_at, i.profile_id, i.profile_name, i.decision, i.defect_count, i.model_id, i.detector_status,
    i.image_path IS NOT NULL AS has_image, i.total_ms,
    (SELECT GROUP_CONCAT(DISTINCT d.class_key) FROM detections d WHERE d.inspection_id = i.id AND d.outcome IN ${ACTIONABLE_SQL}) AS classes,
    (SELECT MAX(d.confidence) FROM detections d WHERE d.inspection_id = i.id AND d.outcome IN ${ACTIONABLE_SQL}) AS max_conf
  FROM inspections i`;

function toSummary(r: SummaryRow): InspectionSummary {
  return {
    id: r.id,
    createdAt: r.created_at,
    profileId: r.profile_id,
    profileName: r.profile_name,
    decision: r.decision,
    defectCount: r.defect_count,
    classes: r.classes ? r.classes.split(",") : [],
    maxConfidence: r.max_conf,
    modelId: r.model_id,
    detectorStatus: r.detector_status,
    imageAvailable: r.has_image === 1,
    totalMs: r.total_ms,
  };
}

export function queryInspections(query: InspectionQuery, db: Database.Database = getDb()) {
  const { sql, params } = buildWhere(query);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM inspections i ${sql}`).get(...params) as { n: number }).n;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const rows = db
    .prepare(`${SUMMARY_SELECT} ${sql} ORDER BY ${SORT_SQL[query.sort]} ${query.dir === "asc" ? "ASC" : "DESC"}, i.id DESC LIMIT ? OFFSET ?`)
    .all(...params, query.pageSize, (page - 1) * query.pageSize) as SummaryRow[];
  return { items: rows.map(toSummary), total, page, pageSize: query.pageSize, pageCount };
}

export function listSummaries(filters: Filters, limit = 10000, db: Database.Database = getDb()): InspectionSummary[] {
  const { sql, params } = buildWhere(filters);
  return (db.prepare(`${SUMMARY_SELECT} ${sql} ORDER BY i.created_at DESC LIMIT ?`).all(...params, limit) as SummaryRow[]).map(toSummary);
}

export function listRecords(filters: Filters, limit = 5000, db: Database.Database = getDb()): InspectionRecord[] {
  const { sql, params } = buildWhere(filters);
  const rows = db.prepare(`SELECT i.* FROM inspections i ${sql} ORDER BY i.created_at DESC LIMIT ?`).all(...params, limit) as InspectionRow[];
  const detStmt = db.prepare("SELECT * FROM detections WHERE inspection_id = ? ORDER BY idx");
  return rows.map((r) => toRecord(r, detStmt.all(r.id) as DetectionRow[]));
}

export interface DetectionFact {
  inspectionId: string;
  createdAt: string;
  profileId: string;
  classKey: string;
  confidence: number;
}

export function listDetectionFacts(filters: Filters, db: Database.Database = getDb()): DetectionFact[] {
  const { sql, params } = buildWhere(filters);
  return db
    .prepare(
      `SELECT d.inspection_id AS inspectionId, i.created_at AS createdAt, i.profile_id AS profileId, d.class_key AS classKey, d.confidence
       FROM detections d JOIN inspections i ON i.id = d.inspection_id
       ${sql ? `${sql} AND` : "WHERE"} d.outcome IN ${ACTIONABLE_SQL}`,
    )
    .all(...params) as DetectionFact[];
}

export function deleteInspection(id: string, db: Database.Database = getDb()): { imagePath: string | null } | null {
  const row = db.prepare("SELECT image_path FROM inspections WHERE id = ?").get(id) as { image_path: string | null } | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM inspections WHERE id = ?").run(id);
  return { imagePath: row.image_path };
}

/** Clear image references older than the cutoff; returns the paths to delete from storage. */
export function detachImagesBefore(cutoffIso: string, db: Database.Database = getDb()): string[] {
  const rows = db
    .prepare("SELECT id, image_path FROM inspections WHERE image_path IS NOT NULL AND created_at < ?")
    .all(cutoffIso) as Array<{ id: string; image_path: string }>;
  const clear = db.prepare("UPDATE inspections SET image_path = NULL WHERE id = ?");
  db.transaction(() => rows.forEach((r) => clear.run(r.id)))();
  return rows.map((r) => r.image_path);
}

/** Profiles and classes that appear in stored data or current profiles, for filter menus. */
export function filterOptions(db: Database.Database = getDb()) {
  const profiles = db
    .prepare(
      `SELECT id, name FROM profiles
       UNION SELECT profile_id AS id, profile_name AS name FROM inspections WHERE profile_id NOT IN (SELECT id FROM profiles)
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ id: string; name: string }>;
  const fromProfiles = (db.prepare("SELECT classes_json FROM profiles").all() as Array<{ classes_json: string }>).flatMap(
    (r) => (JSON.parse(r.classes_json) as Array<{ key: string }>).map((c) => c.key),
  );
  const fromData = (db.prepare("SELECT DISTINCT class_key FROM detections").all() as Array<{ class_key: string }>).map((r) => r.class_key);
  return { profiles, classes: [...new Set([...fromProfiles, ...fromData])].sort() };
}
