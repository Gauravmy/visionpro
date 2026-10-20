import { z } from "zod";
import { classKey } from "./classes";
import { DECISIONS } from "./types";

const threshold = z.number().finite().min(0).max(1);

export const classRuleSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(64),
    enabled: z.boolean(),
    role: z.enum(["defect", "required"]).optional(),
    rejectThreshold: threshold,
    reviewThreshold: threshold,
  })
  .transform((c) => ({ ...c, key: classKey(c.key) }))
  .refine((c) => c.key.length > 0, { message: "Class key must contain letters or digits", path: ["key"] })
  .refine((c) => c.reviewThreshold <= c.rejectThreshold, {
    message: "Review threshold must not exceed the reject threshold",
    path: ["reviewThreshold"],
  });

export const qualityRulesSchema = z
  .object({
    enabled: z.boolean(),
    minBlurVariance: z.number().finite().min(0).max(100000),
    minBrightness: z.number().finite().min(0).max(255),
    maxBrightness: z.number().finite().min(0).max(255),
    minWidth: z.number().int().min(1).max(20000),
    minHeight: z.number().int().min(1).max(20000),
    maxOverexposedFraction: z.number().finite().min(0).max(1),
  })
  .refine((q) => q.minBrightness < q.maxBrightness, {
    message: "Minimum brightness must be lower than maximum brightness",
    path: ["minBrightness"],
  });

export const profileInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    code: z
      .string()
      .trim()
      .min(1, "Product ID is required")
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, '.', '_' or '-'"),
    domain: z.string().trim().min(1, "Domain is required").max(120),
    modelId: z.string().trim().min(1, "Model identifier is required").max(120),
    notes: z.string().max(2000).default(""),
    autoPassEnabled: z.boolean(),
    classes: z.array(classRuleSchema).min(1, "At least one defect class is required").max(64),
    quality: qualityRulesSchema,
  })
  .refine((p) => new Set(p.classes.map((c) => c.key)).size === p.classes.length, {
    message: "Class keys must be unique",
    path: ["classes"],
  });

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const settingsInputSchema = z.object({
  activeProfileId: z.string().min(1).nullable(),
  retainImages: z.boolean(),
  retentionDays: z.number().int().min(1).max(3650).nullable(),
  exportFormat: z.enum(["csv", "json"]),
  csvIncludeBoxes: z.boolean(),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date");

export const SORT_FIELDS = ["createdAt", "decision", "defectCount", "profileName"] as const;

export const inspectionQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  profileId: z.string().max(64).optional(),
  classKey: z.string().max(64).optional(),
  decision: z.enum(DECISIONS as [string, ...string[]]).optional(),
  sort: z.enum(SORT_FIELDS).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ids: z.array(z.string().max(64)).max(500).optional(),
});

export type InspectionQuery = z.infer<typeof inspectionQuerySchema>;

/** Parse URLSearchParams-like input, dropping empty strings so optional filters stay unset. */
export function parseInspectionQuery(params: Record<string, string | string[] | undefined>) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "ids") {
      const list = (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim()).filter(Boolean);
      if (list.length) clean.ids = list;
      continue;
    }
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") clean[k] = value;
  }
  return inspectionQuerySchema.safeParse(clean);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}
