import type { ClassRule } from "./types";

/** Canonical class key: lowercase, non-alphanumerics collapsed to "_". */
export function classKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}


/** NEU-DET surface defect classes (Northeastern University steel surface defect database). */
export const NEU_DET_CLASSES: Array<Pick<ClassRule, "key" | "label">> = [
  { key: "crazing", label: "Crazing" },
  { key: "inclusion", label: "Inclusion" },
  { key: "patches", label: "Patches" },
  { key: "pitted_surface", label: "Pitted surface" },
  { key: "rolled_in_scale", label: "Rolled-in scale" },
  { key: "scratches", label: "Scratches" },
];

export function classLabel(key: string): string {
  if (key === "out_of_range") return "Out of range";
  const known = NEU_DET_CLASSES.find((c) => c.key === key);
  if (known) return known.label;
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Box caption: the class, or what an out-of-range object looks like ("Out of range: cup"). */
export function detectionLabel(d: { classKey: string; label?: string }): string {
  if (d.classKey === "out_of_range") return d.label ? `Out of range: ${d.label}` : "Out of range";
  return classLabel(d.classKey);
}

/** True when the decision says the item is not one of the supported products. */
export function isOutOfRange(reasons: Array<{ code: string }>): boolean {
  return reasons.some((r) => r.code === "OUT_OF_RANGE");
}

/** Badge text override for out-of-range results; undefined keeps the decision. */
export function decisionLabel(reasons: Array<{ code: string }>): string | undefined {
  return isOutOfRange(reasons) ? "OUT OF RANGE" : undefined;
}

/**
 * Fixed categorical palette (validated for CVD separation on the dark chart surface).
 * Colour follows the class's position in its profile, never its rank in a chart.
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
export const OTHER_COLOR = "#7d8ba0";

export function colorForClass(key: string, order: string[]): string {
  const idx = order.indexOf(key);
  return idx >= 0 && idx < SERIES_COLORS.length ? SERIES_COLORS[idx] : OTHER_COLOR;
}
