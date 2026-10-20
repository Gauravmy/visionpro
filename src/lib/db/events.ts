import "server-only";
import type Database from "better-sqlite3";
import type { SystemEvent } from "../types";
import { getDb } from "./index";

export function logEvent(type: string, message: string, inspectionId: string | null = null, db: Database.Database = getDb()) {
  db.prepare("INSERT INTO events (created_at, type, message, inspection_id) VALUES (?, ?, ?, ?)").run(
    new Date().toISOString(),
    type,
    message,
    inspectionId,
  );
}

export function listEvents(limit = 10, db: Database.Database = getDb()): SystemEvent[] {
  return db
    .prepare(
      "SELECT id, created_at AS createdAt, type, message, inspection_id AS inspectionId FROM events ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as SystemEvent[];
}
