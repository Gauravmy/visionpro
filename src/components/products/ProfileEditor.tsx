"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { classKey } from "@/lib/classes";
import { DEFAULT_MODEL_ID, DEFAULT_QUALITY_RULES } from "@/lib/profiles/defaults";
import type { ClassRule, ProductProfile, QualityRules } from "@/lib/types";
import { profileInputSchema } from "@/lib/validation";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Field, Input, Select, Switch, Textarea } from "../ui/form";
import { Button, IconButton, Notice, Panel, PanelHeader, Tag, cn } from "../ui/primitives";

interface Draft {
  name: string;
  code: string;
  domain: string;
  modelId: string;
  notes: string;
  autoPassEnabled: boolean;
  classes: ClassRule[];
  quality: QualityRules;
}

const blankDraft = (): Draft => ({
  name: "",
  code: "",
  domain: "",
  modelId: DEFAULT_MODEL_ID,
  notes: "",
  autoPassEnabled: false,
  classes: [{ key: "", label: "", enabled: true, rejectThreshold: 0.5, reviewThreshold: 0.25 }],
  quality: { ...DEFAULT_QUALITY_RULES },
});

const toDraft = (p: ProductProfile): Draft => ({
  name: p.name,
  code: p.code,
  domain: p.domain,
  modelId: p.modelId,
  notes: p.notes,
  autoPassEnabled: p.autoPassEnabled,
  classes: p.classes.map((c) => ({ ...c })),
  quality: { ...p.quality },
});

type Errors = Record<string, string>;

function collectErrors(draft: Draft): Errors {
  const res = profileInputSchema.safeParse({ ...draft, classes: draft.classes.map((c) => ({ ...c, key: c.key || c.label })) });
  if (res.success) return {};
  const out: Errors = {};
  for (const issue of res.error.issues) {
    const k = issue.path.join(".");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        className="tabular"
      />
    </Field>
  );
}

export function ProfileEditor({ profiles, selectedId, activeProfileId }: { profiles: ProductProfile[]; selectedId: string | "new"; activeProfileId: string | null }) {
  const router = useRouter();
  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const isNew = selectedId === "new" || !selected;
  const [draft, setDraft] = useState<Draft>(selected ? toDraft(selected) : blankDraft());
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Switching profiles resets the form; a refreshed copy of the same profile (after saving) only reloads the draft.
  useEffect(() => {
    setShowErrors(false);
    setServerError(null);
    setSaved(false);
  }, [selectedId]);
  const selectedVersion = selected ? `${selected.id}@${selected.updatedAt}` : "new";
  useEffect(() => {
    setDraft(selected ? toDraft(selected) : blankDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on id+updatedAt so router refreshes don't discard edits
  }, [selectedVersion]);

  const errors = useMemo(() => collectErrors(draft), [draft]);
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(selected ? toDraft(selected) : blankDraft()), [draft, selected]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const setQ = <K extends keyof QualityRules>(k: K, v: QualityRules[K]) => set("quality", { ...draft.quality, [k]: v });
  const setClass = (i: number, patch: Partial<ClassRule>) => set("classes", draft.classes.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = async () => {
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(errors).length) return;
    setSaving(true);
    const payload = { ...draft, classes: draft.classes.map((c) => ({ ...c, key: classKey(c.key || c.label) })) };
    const res = await fetch(isNew ? "/api/profiles" : `/api/profiles/${selected!.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setServerError(body?.error?.message ?? `Save failed (HTTP ${res.status}).`);
      return;
    }
    setSaved(true);
    if (isNew) router.push(`/products?id=${body.id}`);
    router.refresh();
  };

  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/profiles/${selected.id}`, { method: "DELETE" });
    setSaving(false);
    setConfirmDelete(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setServerError(body?.error?.message ?? "Delete failed.");
      return;
    }
    router.push("/products");
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader
        title={isNew ? "New product profile" : draft.name || "Untitled profile"}
        description={isNew ? "Define the product, its model and decision rules" : `Last updated ${new Date(selected!.updatedAt).toLocaleString("en-GB")}`}
        actions={
          <>
            {!isNew && selected!.id === activeProfileId ? <Tag tone="info">Active</Tag> : null}
            {!isNew ? (
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={profiles.length <= 1 || saving} title={profiles.length <= 1 ? "At least one profile must remain" : undefined}>
                <Trash2 aria-hidden className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
            <Button size="sm" variant="primary" onClick={save} disabled={saving || (!dirty && !isNew)}>
              <Save aria-hidden className="h-3.5 w-3.5" /> {saving ? "Saving…" : isNew ? "Create profile" : "Save changes"}
            </Button>
          </>
        }
      />
      <form
        className="space-y-6 p-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {serverError ? <Notice tone="error" title="Not saved">{serverError}</Notice> : null}
        {showErrors && Object.keys(errors).length ? <Notice tone="error">Fix the highlighted fields before saving.</Notice> : null}
        {saved ? <Notice tone="info">Profile saved. New inspections use these settings; past records keep the settings they were inspected with.</Notice> : null}

        <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Product</legend>
          <Field label="Product name" htmlFor="p-name" error={err("name")}>
            <Input id="p-name" value={draft.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
          </Field>
          <Field label="Product ID" htmlFor="p-code" error={err("code")} hint="Letters, digits, '.', '_' or '-'">
            <Input id="p-code" value={draft.code} onChange={(e) => set("code", e.target.value)} aria-invalid={!!err("code")} className="font-mono" />
          </Field>
          <Field label="Inspection domain" htmlFor="p-domain" error={err("domain")}>
            <Input id="p-domain" value={draft.domain} onChange={(e) => set("domain", e.target.value)} aria-invalid={!!err("domain")} placeholder="e.g. Steel surface defects" />
          </Field>
          <Field label="Model identifier" htmlFor="p-model" error={err("modelId")} hint="Must match the model ID reported by the inference service">
            <Input id="p-model" value={draft.modelId} onChange={(e) => set("modelId", e.target.value)} aria-invalid={!!err("modelId")} className="font-mono" />
          </Field>
          <Field label="Inspection notes" htmlFor="p-notes" className="sm:col-span-2" error={err("notes")}>
            <Textarea id="p-notes" value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Classes and thresholds</legend>
          <p className="mb-3 text-xs text-subtle">
            <strong className="font-medium text-muted">Defect</strong>: score ≥ reject threshold → REJECT; review ≤ score &lt; reject → REVIEW.{" "}
            <strong className="font-medium text-muted">Required product</strong>: must be found with score ≥ the second threshold, otherwise REJECT (a score between
            the two → REVIEW). Scores are raw detector confidences, not calibrated probabilities; set thresholds from validation data.
          </p>
          {err("classes") ? <p className="mb-2 text-xs text-reject">{err("classes")}</p> : null}
          <div className="relative overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-sunken text-left font-mono text-[10.5px] uppercase tracking-wider text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Enabled</th>
                  <th scope="col" className="px-3 py-2 font-medium">Label</th>
                  <th scope="col" className="px-3 py-2 font-medium">Class key</th>
                  <th scope="col" className="px-3 py-2 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 font-medium">Review ≥</th>
                  <th scope="col" className="px-3 py-2 font-medium">Reject / confirm ≥</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.classes.map((c, i) => {
                  const e = (f: string) => err(`classes.${i}.${f}`);
                  return (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          onChange={(ev) => setClass(i, { enabled: ev.target.checked })}
                          aria-label={`Enable ${c.label || `class ${i + 1}`}`}
                          className="mt-2 h-4 w-4 cursor-pointer accent-[var(--ink)]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={c.label} onChange={(ev) => setClass(i, { label: ev.target.value })} aria-label={`Label for class ${i + 1}`} aria-invalid={!!e("label")} className="h-8" />
                        {e("label") ? <p className="mt-1 text-xs text-reject">{e("label")}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={c.key}
                          placeholder={classKey(c.label) || "auto from label"}
                          onChange={(ev) => setClass(i, { key: ev.target.value })}
                          aria-label={`Key for class ${i + 1}`}
                          aria-invalid={!!e("key")}
                          className="h-8 font-mono text-xs"
                        />
                        {e("key") ? <p className="mt-1 text-xs text-reject">{e("key")}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={c.role ?? "defect"}
                          onChange={(ev) => setClass(i, { role: ev.target.value === "required" ? "required" : "defect" })}
                          aria-label={`Role for ${c.label || `class ${i + 1}`}`}
                          className="h-8 w-[9.5rem] text-xs"
                        >
                          <option value="defect">Defect</option>
                          <option value="required">Required product</option>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={Number.isFinite(c.reviewThreshold) ? c.reviewThreshold : ""}
                          onChange={(ev) => setClass(i, { reviewThreshold: ev.target.value === "" ? NaN : Number(ev.target.value) })}
                          aria-label={`Review threshold for ${c.label || `class ${i + 1}`}`}
                          aria-invalid={!!e("reviewThreshold")}
                          className="tabular h-8 w-24"
                        />
                        {e("reviewThreshold") ? <p className="mt-1 max-w-40 text-xs text-reject">{e("reviewThreshold")}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={Number.isFinite(c.rejectThreshold) ? c.rejectThreshold : ""}
                          onChange={(ev) => setClass(i, { rejectThreshold: ev.target.value === "" ? NaN : Number(ev.target.value) })}
                          aria-label={`Reject threshold for ${c.label || `class ${i + 1}`}`}
                          aria-invalid={!!e("rejectThreshold")}
                          className="tabular h-8 w-24"
                        />
                        {e("rejectThreshold") ? <p className="mt-1 text-xs text-reject">{e("rejectThreshold")}</p> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <IconButton label={`Remove ${c.label || `class ${i + 1}`}`} onClick={() => set("classes", draft.classes.filter((_, j) => j !== i))} disabled={draft.classes.length <= 1}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => set("classes", [...draft.classes, { key: "", label: "", enabled: true, rejectThreshold: 0.5, reviewThreshold: 0.25 }])}
          >
            <Plus aria-hidden className="h-3.5 w-3.5" /> Add class
          </Button>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">Image-quality checks (OpenCV)</legend>
          <Switch
            id="q-enabled"
            checked={draft.quality.enabled}
            onChange={(v) => setQ("enabled", v)}
            label="Run image-quality checks"
            description="A failed check sends the result to REVIEW. These are heuristics; tune them on images from your own camera setup."
          />
          <div className={cn("mt-4 grid gap-4 sm:grid-cols-3", !draft.quality.enabled && "opacity-50")}>
            <NumberField id="q-blur" label="Min. focus (variance of Laplacian)" value={draft.quality.minBlurVariance} step={1} min={0} onChange={(v) => setQ("minBlurVariance", v)} error={err("quality.minBlurVariance")} />
            <NumberField id="q-minb" label="Min. mean brightness (0–255)" value={draft.quality.minBrightness} min={0} max={255} onChange={(v) => setQ("minBrightness", v)} error={err("quality.minBrightness")} />
            <NumberField id="q-maxb" label="Max. mean brightness (0–255)" value={draft.quality.maxBrightness} min={0} max={255} onChange={(v) => setQ("maxBrightness", v)} error={err("quality.maxBrightness")} />
            <NumberField id="q-minw" label="Min. width (px)" value={draft.quality.minWidth} min={1} onChange={(v) => setQ("minWidth", v)} error={err("quality.minWidth")} />
            <NumberField id="q-minh" label="Min. height (px)" value={draft.quality.minHeight} min={1} onChange={(v) => setQ("minHeight", v)} error={err("quality.minHeight")} />
            <NumberField
              id="q-clip"
              label="Max. clipped highlights (fraction)"
              value={draft.quality.maxOverexposedFraction}
              step={0.01}
              min={0}
              max={1}
              onChange={(v) => setQ("maxOverexposedFraction", v)}
              error={err("quality.maxOverexposedFraction")}
              hint="Share of pixels ≥ 245"
            />
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">Decision policy</legend>
          <Switch
            id="p-autopass"
            checked={draft.autoPassEnabled}
            onChange={(v) => set("autoPassEnabled", v)}
            label="Allow automatic PASS"
            description="When off, results with no triggered rule are sent to REVIEW for operator confirmation instead of PASS."
          />
        </fieldset>
        <button type="submit" className="sr-only">Save</button>
      </form>
      <ConfirmDialog open={confirmDelete} title={`Delete "${selected?.name ?? ""}"?`} confirmLabel="Delete profile" busy={saving} onCancel={() => setConfirmDelete(false)} onConfirm={remove}>
        The profile is removed. Existing inspection records keep a copy of the settings they were inspected with and remain available.
      </ConfirmDialog>
    </Panel>
  );
}
