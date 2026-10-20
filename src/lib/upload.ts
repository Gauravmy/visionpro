/** Upload rules shared by the browser (early feedback) and the server (enforcement). */

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];
export const ACCEPT_ATTR = ALLOWED_MIME.join(",");
export const DEFAULT_MAX_UPLOAD_MB = 10;

export const EXT_FOR_MIME: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Identify the format from file signature bytes; the declared MIME type is not trusted. */
export function sniffImageMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type UploadCheck = { ok: true } | { ok: false; code: "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE"; message: string };

/** Quick check on declared type and size, used before reading file contents. */
export function checkFileMeta(file: { size: number; type: string }, maxMb = DEFAULT_MAX_UPLOAD_MB): UploadCheck {
  if (file.size === 0) return { ok: false, code: "EMPTY_FILE", message: "The selected file is empty." };
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, code: "FILE_TOO_LARGE", message: `The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${maxMb} MB.` };
  }
  if (file.type && !(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, code: "UNSUPPORTED_TYPE", message: "Unsupported file type. Use a JPEG, PNG or WebP image." };
  }
  return { ok: true };
}

/** Strip directory components and unsafe characters from a client-supplied filename (display only). */
export function safeDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120).trim();
  return cleaned || null;
}
