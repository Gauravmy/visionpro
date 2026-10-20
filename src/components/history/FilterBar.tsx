import Link from "next/link";
import { Search } from "lucide-react";
import { classLabel } from "@/lib/classes";
import { DECISIONS } from "@/lib/types";
import { Input, Select } from "../ui/form";
import { buttonClass } from "../ui/primitives";

export interface FilterValues {
  q?: string;
  from?: string;
  to?: string;
  profileId?: string;
  classKey?: string;
  decision?: string;
}

/**
 * Plain GET form so filters live in the URL (shareable, back-button friendly) and work without JavaScript.
 * `fields` chooses which controls appear; `hidden` carries extra params such as sort or granularity.
 */
export function FilterBar({
  action,
  values,
  options,
  fields = ["q", "from", "to", "profileId", "classKey", "decision"],
  hidden = {},
  submitLabel = "Apply",
}: {
  action: string;
  values: FilterValues;
  options: { profiles: Array<{ id: string; name: string }>; classes: string[] };
  fields?: Array<keyof FilterValues>;
  hidden?: Record<string, string | undefined>;
  submitLabel?: string;
}) {
  const has = (f: keyof FilterValues) => fields.includes(f);
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter inspections">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {has("q") ? (
        <div className="w-full sm:w-52">
          <label htmlFor="f-q" className="mb-1.5 block text-[12px] font-medium text-muted">Inspection ID</label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-subtle" />
            <Input id="f-q" name="q" defaultValue={values.q} placeholder="INS-…" className="pl-8" autoComplete="off" />
          </div>
        </div>
      ) : null}
      {has("from") ? (
        <div>
          <label htmlFor="f-from" className="mb-1.5 block text-[12px] font-medium text-muted">From</label>
          <Input id="f-from" type="date" name="from" defaultValue={values.from} className="w-[9.5rem]" />
        </div>
      ) : null}
      {has("to") ? (
        <div>
          <label htmlFor="f-to" className="mb-1.5 block text-[12px] font-medium text-muted">To</label>
          <Input id="f-to" type="date" name="to" defaultValue={values.to} className="w-[9.5rem]" />
        </div>
      ) : null}
      {has("profileId") ? (
        <div>
          <label htmlFor="f-profile" className="mb-1.5 block text-[12px] font-medium text-muted">Product</label>
          <Select id="f-profile" name="profileId" defaultValue={values.profileId ?? ""} className="w-48">
            <option value="">All products</option>
            {options.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {has("classKey") ? (
        <div>
          <label htmlFor="f-class" className="mb-1.5 block text-[12px] font-medium text-muted">Defect class</label>
          <Select id="f-class" name="classKey" defaultValue={values.classKey ?? ""} className="w-40">
            <option value="">All classes</option>
            {options.classes.map((c) => (
              <option key={c} value={c}>
                {classLabel(c)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {has("decision") ? (
        <div>
          <label htmlFor="f-decision" className="mb-1.5 block text-[12px] font-medium text-muted">Decision</label>
          <Select id="f-decision" name="decision" defaultValue={values.decision ?? ""} className="w-32">
            <option value="">All</option>
            {DECISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("primary")}>
          {submitLabel}
        </button>
        <Link href={action} className={buttonClass("ghost")}>
          Clear
        </Link>
      </div>
    </form>
  );
}
