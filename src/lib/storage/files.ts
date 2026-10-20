import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../db";
import { EXT_FOR_MIME, type AllowedMime } from "../upload";

function imagesRoot(): string {
  return path.join(dataDir(), "images");
}

/** Store an image under data/images/YYYY/MM/<inspectionId>.<ext>. Returns a path relative to the images root. */
export async function storeImage(inspectionId: string, mime: AllowedMime, bytes: Buffer, createdAt: Date): Promise<string> {
  if (!/^[A-Z0-9-]+$/.test(inspectionId)) throw new Error("Invalid inspection id");
  const rel = path.posix.join(
    String(createdAt.getUTCFullYear()),
    String(createdAt.getUTCMonth() + 1).padStart(2, "0"),
    `${inspectionId}.${EXT_FOR_MIME[mime]}`,
  );
  const abs = resolveStored(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes, { flag: "wx" });
  return rel;
}

/** Resolve a stored relative path, refusing anything that escapes the images root. */
export function resolveStored(rel: string): string {
  const root = imagesRoot();
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new Error("Path outside storage root");
  return abs;
}

export async function readImage(rel: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveStored(rel));
  } catch {
    return null;
  }
}

export async function deleteImage(rel: string | null): Promise<void> {
  if (!rel) return;
  try {
    await fs.unlink(resolveStored(rel));
  } catch {
    // Already removed; nothing to do.
  }
}
