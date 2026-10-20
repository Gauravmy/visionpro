/** Operational statistics computed from stored inspection records (not model-evaluation metrics). */
import type { Decision, InspectionSummary } from "./types";

export interface DetectionFactLite {
  inspectionId: string;
  createdAt: string;
  profileId: string;
  classKey: string;
}

export interface Totals {
  total: number;
  pass: number;
  reject: number;
  review: number;
  /** Rates use all stored inspections as the denominator; null when there are none. */
  passRate: number | null;
  rejectRate: number | null;
  reviewRate: number | null;
  defects: number;
  latest: string | null;
}

export function computeTotals(items: InspectionSummary[]): Totals {
  const count = (d: Decision) => items.filter((i) => i.decision === d).length;
  const total = items.length;
  const pass = count("PASS");
  const reject = count("REJECT");
  const review = count("REVIEW");
  const rate = (n: number) => (total ? n / total : null);
  const latest = items.reduce<string | null>((acc, i) => (!acc || i.createdAt > acc ? i.createdAt : acc), null);
  return {
    total,
    pass,
    reject,
    review,
    passRate: rate(pass),
    rejectRate: rate(reject),
    reviewRate: rate(review),
    defects: items.reduce((s, i) => s + i.defectCount, 0),
    latest,
  };
}

export type Granularity = "day" | "week";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-time bucket key: the day, or the Monday that starts the week. */
export function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (g === "week") {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return localDayKey(monday);
  }
  return localDayKey(d);
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Every bucket key between two local days inclusive (capped to avoid runaway ranges). */
export function bucketRange(fromDay: string, toDay: string, g: Granularity, cap = 400): string[] {
  const keys: string[] = [];
  let cur = parseDay(bucketKey(parseDay(fromDay).toISOString(), g));
  const end = parseDay(toDay);
  const step = g === "week" ? 7 : 1;
  while (cur <= end && keys.length < cap) {
    keys.push(localDayKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + step);
  }
  return keys;
}

export interface VolumeBucket {
  key: string;
  PASS: number;
  REJECT: number;
  REVIEW: number;
  total: number;
}

export function volumeSeries(items: InspectionSummary[], keys: string[], g: Granularity): VolumeBucket[] {
  const map = new Map<string, VolumeBucket>(keys.map((k) => [k, { key: k, PASS: 0, REJECT: 0, REVIEW: 0, total: 0 }]));
  for (const i of items) {
    const b = map.get(bucketKey(i.createdAt, g));
    if (!b) continue;
    b[i.decision] += 1;
    b.total += 1;
  }
  return [...map.values()];
}

export interface ClassCount {
  classKey: string;
  detections: number;
  inspections: number;
}

export function classDistribution(facts: DetectionFactLite[]): ClassCount[] {
  const byClass = new Map<string, { detections: number; inspections: Set<string> }>();
  for (const f of facts) {
    const e = byClass.get(f.classKey) ?? { detections: 0, inspections: new Set<string>() };
    e.detections += 1;
    e.inspections.add(f.inspectionId);
    byClass.set(f.classKey, e);
  }
  return [...byClass.entries()]
    .map(([classKey, e]) => ({ classKey, detections: e.detections, inspections: e.inspections.size }))
    .sort((a, b) => b.detections - a.detections || a.classKey.localeCompare(b.classKey));
}

export function classTrend(facts: DetectionFactLite[], keys: string[], g: Granularity): Array<{ key: string; counts: Record<string, number> }> {
  const map = new Map(keys.map((k) => [k, {} as Record<string, number>]));
  for (const f of facts) {
    const row = map.get(bucketKey(f.createdAt, g));
    if (row) row[f.classKey] = (row[f.classKey] ?? 0) + 1;
  }
  return keys.map((key) => ({ key, counts: map.get(key)! }));
}

export interface ProductComparison {
  profileId: string;
  profileName: string;
  totals: Totals;
}

export function productComparison(items: InspectionSummary[]): ProductComparison[] {
  const groups = new Map<string, InspectionSummary[]>();
  for (const i of items) groups.set(i.profileId, [...(groups.get(i.profileId) ?? []), i]);
  return [...groups.entries()]
    .map(([profileId, list]) => ({ profileId, profileName: list[0].profileName, totals: computeTotals(list) }))
    .sort((a, b) => b.totals.total - a.totals.total);
}
