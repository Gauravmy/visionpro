import "server-only";
import { randomBytes } from "node:crypto";
import { evaluateInspection, detectorConfidenceFloor } from "../decision/engine";
import { logEvent } from "../db/events";
import { insertInspection } from "../db/inspections";
import { getProfile } from "../db/profiles";
import { getSettings } from "../db/settings";
import { analyzeImage, InferenceError, liveImgsz } from "../inference/client";
import type { ParsedAnalysis } from "../inference/schemas";
import { storeImage } from "../storage/files";
import type { InspectionRecord, InspectionSource } from "../types";
import type { AllowedMime } from "../upload";
import { applyRetention } from "./retention";

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newInspectionId(now: Date): string {
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
  return `INS-${day}-${suffix}`;
}

export class InspectionInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface RunInspectionInput {
  bytes: Buffer;
  mime: AllowedMime;
  originalFilename: string | null;
  source: InspectionSource;
  profileId: string;
}

/**
 * Analyse and decide. With persist=false (live camera preview) nothing is stored or logged
 * and the record gets the placeholder id "LIVE".
 */
export async function runInspection(input: RunInspectionInput, startedAt: number, persist = true): Promise<InspectionRecord> {
  const profile = getProfile(input.profileId);
  if (!profile) throw new InspectionInputError("PROFILE_NOT_FOUND", "The selected product profile does not exist.", 404);

  const now = new Date();
  const id = persist ? newInspectionId(now) : "LIVE";
  const warnings: string[] = [];

  let analysis: ParsedAnalysis | null = null;
  let serviceMessage = "";
  const serviceStarted = performance.now();
  try {
    analysis = await analyzeImage(
      input.bytes,
      input.mime,
      detectorConfidenceFloor(profile.classes),
      persist ? {} : { thorough: false, imgsz: liveImgsz() },
    );
  } catch (err) {
    if (err instanceof InferenceError && err.kind === "rejected" && err.status && err.status >= 400 && err.status < 500) {
      // The service validated the image and refused it (corrupt, unsupported): surface as a client error, store nothing.
      throw new InspectionInputError("INVALID_IMAGE", err.message, err.status === 413 ? 413 : 422);
    }
    serviceMessage = err instanceof Error ? err.message : "Inference service failed.";
    warnings.push(`Inference service: ${serviceMessage}`);
  }
  const serviceRoundTripMs = analysis ? performance.now() - serviceStarted : null;

  const detector = analysis?.detector ?? { status: "unavailable" as const, modelId: null, modelVersion: null, message: serviceMessage };
  const quality = analysis?.quality ?? { status: "unavailable" as const, message: serviceMessage };
  if (detector.status !== "ok" && analysis) warnings.push(`Detector ${detector.status}: ${detector.message}`);

  const result = evaluateInspection({ profile, detector, quality });
  const settings = getSettings();

  const imagePath = persist && settings.retainImages ? await storeImage(id, input.mime, input.bytes, now) : null;
  if (persist && !settings.retainImages) warnings.push("Image not stored: image retention is disabled in Settings.");

  const record: InspectionRecord = {
    id,
    createdAt: now.toISOString(),
    profileId: profile.id,
    profileName: profile.name,
    profileSnapshot: profile,
    decision: result.decision,
    defectCount: result.detections.filter((d) => d.outcome === "reject" || d.outcome === "review").length,
    source: input.source,
    originalFilename: input.originalFilename,
    imageAvailable: imagePath !== null,
    imageMime: input.mime,
    imageWidth: analysis?.image.width ?? null,
    imageHeight: analysis?.image.height ?? null,
    imageBytes: input.bytes.length,
    modelId: detector.modelId,
    modelVersion: detector.modelVersion,
    detectorStatus: detector.status,
    quality,
    detections: result.detections,
    reasons: result.reasons,
    warnings,
    timings: {
      totalMs: 0,
      serviceRoundTripMs,
      decodeMs: analysis?.decodeMs ?? null,
      qualityMs: quality.status === "ok" ? quality.metrics.processingMs : null,
      preprocessMs: detector.status === "ok" ? detector.timings.preprocessMs : null,
      inferenceMs: detector.status === "ok" ? detector.timings.inferenceMs : null,
      postprocessMs: detector.status === "ok" ? detector.timings.postprocessMs : null,
    },
  };
  record.timings.totalMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (!persist) return record;
  insertInspection(record, imagePath);
  logEvent("inspection", `${record.id} completed: ${record.decision} (${profile.name}).`, record.id);
  await applyRetention(settings).catch(() => undefined);
  return record;
}
