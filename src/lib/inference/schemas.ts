/** Response contracts of the FastAPI inference service, validated before use. */
import { z } from "zod";
import type { DetectorEvidence, QualityEvidence } from "../types";

const nullableMs = z.number().finite().nonnegative().nullable();

export const detectionSchema = z.object({
  classId: z.number().int(),
  className: z.string().min(1),
  confidence: z.number().min(0).max(1),
  box: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }),
  label: z.string().min(1).optional(),
});

export const qualityMetricsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.number(),
  blurVariance: z.number().nonnegative(),
  brightnessMean: z.number(),
  contrastStd: z.number(),
  underexposedFraction: z.number().min(0).max(1),
  overexposedFraction: z.number().min(0).max(1),
  processingMs: z.number().nonnegative(),
});

const detectorOk = z.object({
  status: z.literal("ok"),
  modelId: z.string(),
  modelVersion: z.string(),
  classes: z.array(z.string()),
  confThreshold: z.number(),
  detections: z.array(detectionSchema),
  timings: z.object({
    preprocessMs: nullableMs,
    inferenceMs: nullableMs,
    postprocessMs: nullableMs,
    totalMs: nullableMs,
  }),
});

const detectorNotOk = z.object({
  status: z.enum(["unavailable", "error"]),
  modelId: z.string().nullable(),
  modelVersion: z.string().nullable(),
  message: z.string().nullable(),
});

export const analyzeResponseSchema = z.object({
  image: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), format: z.string().nullable() }),
  quality: z.object({ status: z.literal("ok"), metrics: qualityMetricsSchema }),
  detection: z.discriminatedUnion("status", [detectorOk, detectorNotOk.extend({ status: z.literal("unavailable") }), detectorNotOk.extend({ status: z.literal("error") })]),
  timings: z.object({ decodeMs: nullableMs, serviceTotalMs: nullableMs }),
});
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
  quality: z.object({ available: z.boolean(), opencvVersion: z.string().nullable().optional() }),
  model: z.object({
    loaded: z.boolean(),
    weightsPresent: z.boolean(),
    framework: z.string(),
    modelId: z.string(),
    modelVersion: z.string(),
    imgsz: z.number(),
    classes: z.array(z.string()),
    loadedAt: z.string().nullable(),
    loadMs: z.number().nullable(),
    error: z.string().nullable(),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export interface ParsedAnalysis {
  image: { width: number; height: number };
  quality: QualityEvidence;
  detector: DetectorEvidence;
  decodeMs: number | null;
}

/** Validate and normalise an /api/analyze payload. Throws on contract violations. */
export function parseAnalyzeResponse(json: unknown): ParsedAnalysis {
  const r = analyzeResponseSchema.parse(json);
  const d = r.detection;
  const detector: DetectorEvidence =
    d.status === "ok"
      ? d
      : { status: d.status, modelId: d.modelId, modelVersion: d.modelVersion, message: d.message ?? "No message from service." };
  return {
    image: { width: r.image.width, height: r.image.height },
    quality: { status: "ok", metrics: r.quality.metrics },
    detector,
    decodeMs: r.timings.decodeMs,
  };
}
