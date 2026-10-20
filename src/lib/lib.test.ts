import { describe, expect, it } from "vitest";
import { bucketKey, bucketRange, classDistribution, computeTotals, volumeSeries } from "./analytics";
import { classKey } from "./classes";
import { csvCell, inspectionsToCsv } from "./export";
import { parseAnalyzeResponse } from "./inference/schemas";
import { defaultSteelProfile } from "./profiles/defaults";
import type { InspectionRecord, InspectionSummary } from "./types";
import { checkFileMeta, safeDisplayName, sniffImageMime } from "./upload";
import { parseInspectionQuery, profileInputSchema } from "./validation";

describe("classKey", () => {
  it.each([
    ["rolled-in_scale", "rolled_in_scale"],
    ["Pitted Surface", "pitted_surface"],
    ["  scratches ", "scratches"],
    ["--x--", "x"],
  ])("%s -> %s", (input, expected) => expect(classKey(input)).toBe(expected));
});

describe("upload validation", () => {
  it("identifies formats from signature bytes", () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageMime(webp)).toBe("image/webp");
    expect(sniffImageMime(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageMime(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });
  it("checks size and declared type", () => {
    expect(checkFileMeta({ size: 0, type: "image/png" })).toMatchObject({ ok: false, code: "EMPTY_FILE" });
    expect(checkFileMeta({ size: 11 * 1024 * 1024, type: "image/png" }, 10)).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
    expect(checkFileMeta({ size: 100, type: "application/pdf" })).toMatchObject({ ok: false, code: "UNSUPPORTED_TYPE" });
    expect(checkFileMeta({ size: 100, type: "image/webp" })).toEqual({ ok: true });
  });
  it("sanitises display filenames", () => {
    expect(safeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayName("C:\\Users\\x\\<img>.png")).toBe("_img_.png");
    expect(safeDisplayName("")).toBeNull();
  });
});

describe("parseAnalyzeResponse", () => {
  const base = {
    image: { width: 200, height: 100, format: "png" },
    quality: {
      status: "ok",
      metrics: {
        width: 200,
        height: 100,
        aspectRatio: 2,
        blurVariance: 300,
        brightnessMean: 120,
        contrastStd: 30,
        underexposedFraction: 0,
        overexposedFraction: 0.01,
        processingMs: 1.2,
      },
    },
    timings: { decodeMs: 0.5, serviceTotalMs: 9 },
  };

  it("parses detections", () => {
    const parsed = parseAnalyzeResponse({
      ...base,
      detection: {
        status: "ok",
        modelId: "m",
        modelVersion: "1",
        classes: ["scratches"],
        confThreshold: 0.25,
        message: null,
        detections: [{ classId: 0, className: "scratches", confidence: 0.9, box: { x1: 1, y1: 2, x2: 3, y2: 4 } }],
        timings: { preprocessMs: 1, inferenceMs: 5, postprocessMs: 1, totalMs: 7 },
      },
    });
    expect(parsed.detector.status).toBe("ok");
    if (parsed.detector.status === "ok") expect(parsed.detector.detections[0].box.x2).toBe(3);
    expect(parsed.quality.status).toBe("ok");
  });

  it("maps an unavailable detector without inventing detections", () => {
    const parsed = parseAnalyzeResponse({
      ...base,
      detection: { status: "unavailable", modelId: "m", modelVersion: "1", classes: [], message: "Weights file not found." },
    });
    expect(parsed.detector).toEqual({ status: "unavailable", modelId: "m", modelVersion: "1", message: "Weights file not found." });
  });

  it("rejects malformed payloads", () => {
    expect(() => parseAnalyzeResponse({ ...base, detection: { status: "ok", detections: [{ confidence: 2 }] } })).toThrow();
    expect(() => parseAnalyzeResponse(null)).toThrow();
  });
});

describe("profile validation", () => {
  const p = defaultSteelProfile("2026-01-01T00:00:00Z");
  const input = { name: p.name, code: p.code, domain: p.domain, modelId: p.modelId, notes: "", autoPassEnabled: true, classes: p.classes, quality: p.quality };

  it("accepts the default profile", () => {
    expect(profileInputSchema.safeParse(input).success).toBe(true);
  });
  it("rejects review threshold above reject threshold", () => {
    const bad = { ...input, classes: [{ ...p.classes[0], reviewThreshold: 0.9, rejectThreshold: 0.5 }] };
    expect(profileInputSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects duplicate class keys after normalisation", () => {
    const bad = { ...input, classes: [p.classes[0], { ...p.classes[0], key: "Crazing" }] };
    expect(profileInputSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects out-of-range thresholds and unsafe product ids", () => {
    expect(profileInputSchema.safeParse({ ...input, classes: [{ ...p.classes[0], rejectThreshold: 1.5 }] }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...input, code: "a b/c" }).success).toBe(false);
  });
  it("rejects inverted brightness limits", () => {
    expect(profileInputSchema.safeParse({ ...input, quality: { ...p.quality, minBrightness: 200, maxBrightness: 100 } }).success).toBe(false);
  });
});

describe("inspection query parsing", () => {
  it("drops empty params and applies defaults", () => {
    const r = parseInspectionQuery({ q: "", decision: "", page: "2" });
    expect(r.success && r.data).toMatchObject({ page: 2, sort: "createdAt", dir: "desc" });
    expect(r.success && r.data.q).toBeUndefined();
  });
  it("rejects bad dates, decisions and sort fields", () => {
    expect(parseInspectionQuery({ from: "2026-13-45x" }).success).toBe(false);
    expect(parseInspectionQuery({ decision: "MAYBE" }).success).toBe(false);
    expect(parseInspectionQuery({ sort: "image_path; DROP TABLE" }).success).toBe(false);
  });
  it("splits id lists", () => {
    const r = parseInspectionQuery({ ids: "A, B,,C" });
    expect(r.success && r.data.ids).toEqual(["A", "B", "C"]);
  });
});

describe("CSV export", () => {
  it("escapes quotes, commas and formula prefixes", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
  });

  it("writes one row per record and leaves unmeasured values empty", () => {
    const rec = {
      id: "INS-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      profileName: "Steel",
      decision: "REVIEW",
      defectCount: 0,
      detections: [],
      modelId: null,
      modelVersion: null,
      detectorStatus: "unavailable",
      quality: { status: "unavailable", message: "offline" },
      imageWidth: null,
      imageHeight: null,
      timings: { totalMs: 12.345, inferenceMs: null },
      reasons: [{ code: "MODEL_UNAVAILABLE", severity: "review", message: "Detector unavailable" }],
      warnings: [],
    } as unknown as InspectionRecord;
    const lines = inspectionsToCsv([rec], false).trim().split("\r\n");
    expect(lines).toHaveLength(2);
    const cells = lines[1].split(",");
    expect(cells[0]).toBe("INS-1");
    expect(cells[15]).toBe(""); // inference_ms not measured
    expect(cells[16]).toBe("12.35");
  });
});

describe("analytics", () => {
  const mk = (id: string, createdAt: string, decision: InspectionSummary["decision"], defectCount = 0): InspectionSummary => ({
    id,
    createdAt,
    decision,
    defectCount,
    profileId: "p",
    profileName: "P",
    classes: [],
    maxConfidence: null,
    modelId: null,
    detectorStatus: "ok",
    imageAvailable: true,
    totalMs: 1,
  });

  it("computes rates over all stored inspections and handles empty data", () => {
    expect(computeTotals([])).toMatchObject({ total: 0, passRate: null, latest: null });
    const t = computeTotals([mk("a", "2026-01-01T10:00:00Z", "PASS"), mk("b", "2026-01-02T10:00:00Z", "REJECT", 2), mk("c", "2026-01-03T10:00:00Z", "REVIEW")]);
    expect(t).toMatchObject({ total: 3, pass: 1, reject: 1, review: 1, defects: 2, latest: "2026-01-03T10:00:00Z" });
    expect(t.passRate).toBeCloseTo(1 / 3);
  });

  it("fills empty buckets with zeros", () => {
    const keys = bucketRange("2026-01-01", "2026-01-05", "day");
    expect(keys).toHaveLength(5);
    const local = new Date(2026, 0, 3, 12).toISOString();
    const series = volumeSeries([mk("a", local, "PASS")], keys, "day");
    expect(series.map((s) => s.total)).toEqual([0, 0, 1, 0, 0]);
  });

  it("buckets weeks from Monday", () => {
    const thursday = new Date(2026, 0, 8, 12).toISOString(); // 8 Jan 2026 is a Thursday
    expect(bucketKey(thursday, "week")).toBe("2026-01-05");
  });

  it("counts detections and distinct inspections per class", () => {
    const d = classDistribution([
      { inspectionId: "a", createdAt: "", profileId: "p", classKey: "scratches" },
      { inspectionId: "a", createdAt: "", profileId: "p", classKey: "scratches" },
      { inspectionId: "b", createdAt: "", profileId: "p", classKey: "patches" },
    ]);
    expect(d[0]).toEqual({ classKey: "scratches", detections: 2, inspections: 1 });
  });
});
