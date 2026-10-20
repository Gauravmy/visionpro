/** Horizontal bar list: label, bar and value on one row. Readable as a plain list by assistive tech. */
export interface BarListItem {
  key: string;
  label: string;
  value: number;
  color: string;
  detail?: string;
}

export function BarList({ items, caption, valueSuffix }: { items: BarListItem[]; caption: string; valueSuffix?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={caption} className="space-y-3">
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="flex min-w-0 items-center gap-2 text-fg">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />
            <span className="truncate">{i.label}</span>
          </span>
          <span className="h-[18px] rounded-[3px] bg-sunken" aria-hidden>
            <span className="block h-full rounded-[3px]" style={{ width: `${(i.value / max) * 100}%`, background: i.color, opacity: 0.85, minWidth: i.value > 0 ? 3 : 0 }} />
          </span>
          <span className="tabular min-w-12 text-right font-mono text-fg">
            {i.value}
            {valueSuffix ? <span className="text-subtle"> {valueSuffix}</span> : null}
            {i.detail ? <span className="block font-sans text-[11px] text-subtle">{i.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 100% split bar for PASS/REJECT/REVIEW with counts and rates. `inline` puts the legend beside the bar. */
export function SplitBar({
  parts,
  total,
  inline,
}: {
  parts: Array<{ key: string; label: string; value: number; color: string }>;
  total: number;
  inline?: boolean;
}) {
  const visible = parts.filter((p) => p.value > 0);
  const bar = (
    <div className="flex h-2.5 w-full min-w-0 gap-[2px] overflow-hidden rounded-full md:w-auto md:flex-1" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {total === 0 ? <div className="h-full w-full bg-sunken" /> : visible.map((p) => <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
    </div>
  );
  const legend = (
    <dl className={inline ? "flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]" : "mt-4 grid grid-cols-3 gap-2 text-[13px]"}>
      {parts.map((p) => (
        <div key={p.key} className={inline ? "flex items-center gap-1.5" : undefined}>
          <dt className="flex items-center gap-1.5 text-subtle">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label}
          </dt>
          <dd className={inline ? "tabular font-mono text-fg" : "tabular mt-0.5 font-mono text-fg"}>
            {p.value} <span className="text-subtle">{total ? ((p.value / total) * 100).toFixed(1) : "0.0"}%</span>
          </dd>
        </div>
      ))}
    </dl>
  );
  if (inline) {
    return (
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <span className="eyebrow shrink-0">Yield</span>
        {bar}
        {legend}
      </div>
    );
  }
  return (
    <div>
      {bar}
      {legend}
    </div>
  );
}

/** Theme-aware: these resolve to the light or dark status colours. */
export const DECISION_COLORS = { PASS: "var(--pass)", REJECT: "var(--reject)", REVIEW: "var(--review)" } as const;
