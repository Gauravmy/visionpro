/**
 * API integration tests: real route handlers, a temporary SQLite database and file store,
 * and a mocked inference service (global fetch). No trained model is involved.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vi-api-test-"));
process.env.VI_DATA_DIR = tmp;
process.env.INFERENCE_URL = "http://inference.test";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a4b3f6a00000000049454e44ae426082",
  "hex",
);

type Detection = { classId: number; className: string; confidence: number; box: { x1: number; y1: number; x2: number; y2: number } };

const quality = {
  status: "ok",
  metrics: { width: 640, height: 480, aspectRatio: 1.333, blurVariance: 400, brightnessMean: 120, contrastStd: 35, underexposedFraction: 0, overexposedFraction: 0, processingMs: 2.1 },
};

function analyzeOk(detections: Detection[]) {
  return {
    image: { width: 640, height: 480, format: "png" },
    quality,
    detection: {
      status: "ok",
      modelId: "yolov8n-neu-det",
      modelVersion: "test",
      classes: ["crazing", "scratches"],
      confThreshold: 0.25,
      message: null,
      detections,
      timings: { preprocessMs: 1.5, inferenceMs: 12.3, postprocessMs: 0.8, totalMs: 15 },
    },
    timings: { decodeMs: 0.4, serviceTotalMs: 20 },
  };
}

const analyzeUnavailable = {
  image: { width: 640, height: 480, format: "png" },
  quality,
  detection: { status: "unavailable", modelId: "yolov8n-neu-det", modelVersion: "unversioned", classes: [], message: "Weights file not found." },
  timings: { decodeMs: 0.4, serviceTotalMs: 3 },
};

let nextResponse: () => Promise<Response>;
const realFetch = globalThis.fetch;
const inferenceCalls: string[] = [];
const fetchMock = vi.fn((...args: Parameters<typeof fetch>) => {
  const url = String(args[0] instanceof Request ? args[0].url : args[0]);
  if (!url.startsWith("http://inference.test")) return realFetch(...args);
  inferenceCalls.push(url);
  return nextResponse();
});

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

// Route handlers are imported after the environment is configured.
let inspections: typeof import("./inspections/route");
let inspection: typeof import("./inspections/[id]/route");
let image: typeof import("./inspections/[id]/image/route");
let exportRoute: typeof import("./export/route");
let profiles: typeof import("./profiles/route");
let profile: typeof import("./profiles/[id]/route");
let settings: typeof import("./settings/route");

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  inspections = await import("./inspections/route");
  inspection = await import("./inspections/[id]/route");
  image = await import("./inspections/[id]/image/route");
  exportRoute = await import("./export/route");
  profiles = await import("./profiles/route");
  profile = await import("./profiles/[id]/route");
  settings = await import("./settings/route");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  inferenceCalls.length = 0;
});

function upload(bytes: Buffer, opts: { profileId?: string; name?: string; type?: string; origin?: string } = {}) {
  const form = new FormData();
  form.append("image", new File([new Uint8Array(bytes)], opts.name ?? "part.png", { type: opts.type ?? "image/png" }));
  form.append("profileId", opts.profileId ?? "neu-det-steel");
  const headers: Record<string, string> = { host: "localhost:3000" };
  if (opts.origin) headers.origin = opts.origin;
  return inspections.POST(new Request("http://localhost:3000/api/inspections", { method: "POST", body: form, headers }));
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/inspections", () => {
  it("rejects when a defect meets the reject threshold and stores the record and image", async () => {
    nextResponse = () => json(analyzeOk([{ classId: 1, className: "scratches", confidence: 0.87, box: { x1: 10, y1: 20, x2: 200, y2: 60 } }]));
    const res = await upload(PNG);
    expect(res.status).toBe(201);
    const rec = await res.json();
    expect(rec.decision).toBe("REJECT");
    expect(rec.defectCount).toBe(1);
    expect(rec.detections[0]).toMatchObject({ classKey: "scratches", outcome: "reject", box: { x1: 10, y1: 20, x2: 200, y2: 60 } });
    expect(rec.timings.inferenceMs).toBe(12.3);
    expect(rec.modelId).toBe("yolov8n-neu-det");
    expect(rec.id).toMatch(/^INS-\d{8}-[A-Z0-9]{6}$/);

    const fetched = await (await inspection.GET(new Request("http://x"), ctx(rec.id))).json();
    expect(fetched.detections).toHaveLength(1);
    const img = await image.GET(new Request("http://x"), ctx(rec.id));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
  });

  it("passes when the detector returns no boxes", async () => {
    nextResponse = () => json(analyzeOk([]));
    const rec = await (await upload(PNG)).json();
    expect(rec.decision).toBe("PASS");
    expect(rec.detections).toEqual([]);
  });

  it("records REVIEW without detections when the model is unavailable", async () => {
    nextResponse = () => json(analyzeUnavailable);
    const rec = await (await upload(PNG)).json();
    expect(rec.decision).toBe("REVIEW");
    expect(rec.detectorStatus).toBe("unavailable");
    expect(rec.detections).toEqual([]);
    expect(rec.timings.inferenceMs).toBeNull();
    expect(rec.reasons[0].code).toBe("MODEL_UNAVAILABLE");
  });

  it("records REVIEW with warnings when the inference service is down", async () => {
    nextResponse = () => Promise.reject(new TypeError("fetch failed"));
    const res = await upload(PNG);
    expect(res.status).toBe(201);
    const rec = await res.json();
    expect(rec.decision).toBe("REVIEW");
    expect(rec.quality.status).toBe("unavailable");
    expect(rec.warnings.join(" ")).toContain("unreachable");
    expect(rec.timings.serviceRoundTripMs).toBeNull();
  });

  it("refuses files that are not images, without calling the service", async () => {
    const res = await upload(Buffer.from("hello world, not an image"), { name: "x.png" });
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("UNSUPPORTED_TYPE");
    expect(inferenceCalls).toEqual([]);
  });

  it("refuses unsupported declared types", async () => {
    const res = await upload(PNG, { type: "application/pdf", name: "x.pdf" });
    expect(res.status).toBe(415);
  });

  it("maps a corrupt image rejected by the service to 422 and stores nothing", async () => {
    nextResponse = () => json({ error: { code: "INVALID_IMAGE", message: "The image could not be decoded." } }, 415);
    const before = (await (await inspections.GET(new Request("http://x/api/inspections"))).json()).total;
    const res = await upload(PNG);
    expect(res.status).toBe(422);
    const after = (await (await inspections.GET(new Request("http://x/api/inspections"))).json()).total;
    expect(after).toBe(before);
  });

  it("rejects unknown profiles and cross-origin requests", async () => {
    nextResponse = () => json(analyzeOk([]));
    expect((await upload(PNG, { profileId: "nope" })).status).toBe(404);
    expect((await upload(PNG, { origin: "https://evil.example" })).status).toBe(403);
  });

  it("does not store the image when retention is disabled", async () => {
    await settings.PUT(new Request("http://localhost/api/settings", { method: "PUT", body: JSON.stringify({ retainImages: false }) }));
    nextResponse = () => json(analyzeOk([]));
    const rec = await (await upload(PNG)).json();
    expect(rec.imageAvailable).toBe(false);
    expect((await image.GET(new Request("http://x"), ctx(rec.id))).status).toBe(410);
    await settings.PUT(new Request("http://localhost/api/settings", { method: "PUT", body: JSON.stringify({ retainImages: true }) }));
  });
});

describe("history, export and delete", () => {
  it("filters by decision and class", async () => {
    const rejects = await (await inspections.GET(new Request("http://x/api/inspections?decision=REJECT"))).json();
    expect(rejects.items.every((i: { decision: string }) => i.decision === "REJECT")).toBe(true);
    expect(rejects.total).toBeGreaterThan(0);
    const scratches = await (await inspections.GET(new Request("http://x/api/inspections?classKey=scratches"))).json();
    expect(scratches.items.every((i: { classes: string[] }) => i.classes.includes("scratches"))).toBe(true);
    const bad = await inspections.GET(new Request("http://x/api/inspections?sort=nonsense"));
    expect(bad.status).toBe(400);
  });

  it("paginates and sorts", async () => {
    const page = await (await inspections.GET(new Request("http://x/api/inspections?pageSize=2&page=1&sort=createdAt&dir=asc"))).json();
    expect(page.items).toHaveLength(2);
    expect(page.items[0].createdAt <= page.items[1].createdAt).toBe(true);
  });

  it("exports exactly the matching records as CSV and JSON", async () => {
    const all = (await (await inspections.GET(new Request("http://x/api/inspections"))).json()).total;
    const csv = await exportRoute.GET(new Request("http://x/api/export?format=csv"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("x-record-count")).toBe(String(all));
    const text = await csv.text();
    expect(text.trim().split("\r\n")).toHaveLength(all + 1);

    const rejects = await exportRoute.GET(new Request("http://x/api/export?format=json&decision=REJECT"));
    const body = await rejects.json();
    expect(body.inspections.every((r: { decision: string }) => r.decision === "REJECT")).toBe(true);
    expect(body.filters.decision).toBe("REJECT");
  });

  it("returns 404 for exports with no matches and 400 for inverted ranges", async () => {
    expect((await exportRoute.GET(new Request("http://x/api/export?from=2001-01-01&to=2001-01-02"))).status).toBe(404);
    expect((await exportRoute.GET(new Request("http://x/api/export?from=2026-02-01&to=2026-01-01"))).status).toBe(400);
  });

  it("deletes a record and its image", async () => {
    nextResponse = () => json(analyzeOk([]));
    const rec = await (await upload(PNG)).json();
    const del = await inspection.DELETE(new Request("http://localhost/api/inspections/x", { method: "DELETE" }), ctx(rec.id));
    expect(del.status).toBe(200);
    expect((await inspection.GET(new Request("http://x"), ctx(rec.id))).status).toBe(404);
    expect((await inspection.DELETE(new Request("http://localhost/x", { method: "DELETE" }), ctx(rec.id))).status).toBe(404);
    const leftover = fs.readdirSync(tmp, { recursive: true }).map(String).filter((f) => f.includes(rec.id));
    expect(leftover).toEqual([]);
  });
});

describe("profiles and settings", () => {
  const valid = {
    name: "Aluminium sheet",
    code: "ALU-01",
    domain: "Sheet surface",
    modelId: "yolov8n-neu-det",
    notes: "",
    autoPassEnabled: false,
    classes: [{ key: "scratches", label: "Scratches", enabled: true, rejectThreshold: 0.6, reviewThreshold: 0.3 }],
    quality: { enabled: true, minBlurVariance: 50, minBrightness: 30, maxBrightness: 225, minWidth: 128, minHeight: 128, maxOverexposedFraction: 0.25 },
  };
  const post = (body: unknown) => profiles.POST(new Request("http://localhost/api/profiles", { method: "POST", body: JSON.stringify(body) }));

  it("validates, creates, rejects duplicates and deletes", async () => {
    expect((await post({ ...valid, classes: [] })).status).toBe(422);
    const created = await post(valid);
    expect(created.status).toBe(201);
    const p = await created.json();
    expect((await post(valid)).status).toBe(409);
    const del = await profile.DELETE(new Request("http://localhost/x", { method: "DELETE" }), ctx(p.id));
    expect(del.status).toBe(200);
  });

  it("seeds the bottle, charger and marker profiles with a required product class", async () => {
    const list = (await (await profiles.GET()).json()) as Array<{ id: string; classes: Array<{ key: string; role?: string }> }>;
    for (const [id, key] of [["qc-bottle", "bottle"], ["qc-charger", "charger"], ["qc-marker", "marker"]]) {
      const p = list.find((x) => x.id === id);
      expect(p?.classes.find((c) => c.role === "required")?.key).toBe(key);
    }
  });

  it("refuses to delete the last profile", async () => {
    const del = (id: string) => profile.DELETE(new Request("http://localhost/x", { method: "DELETE" }), ctx(id));
    for (const id of ["qc-bottle", "qc-charger", "qc-marker"]) expect((await del(id)).status).toBe(200);
    expect((await del("neu-det-steel")).status).toBe(409);
  });

  it("validates settings", async () => {
    const bad = await settings.PUT(new Request("http://localhost/api/settings", { method: "PUT", body: JSON.stringify({ retentionDays: -4 }) }));
    expect(bad.status).toBe(422);
    const unknown = await settings.PUT(new Request("http://localhost/api/settings", { method: "PUT", body: JSON.stringify({ activeProfileId: "missing" }) }));
    expect(unknown.status).toBe(422);
  });
});
