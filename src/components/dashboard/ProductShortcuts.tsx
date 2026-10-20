import Link from "next/link";
import { ArrowUpRight, Boxes, Camera, Highlighter, Milk, PlugZap, type LucideIcon } from "lucide-react";
import type { Decision, InspectionSummary, ProductProfile } from "@/lib/types";
import { cn } from "../ui/primitives";

const ICONS: Record<string, LucideIcon> = { bottle: Milk, charger: PlugZap, marker: Highlighter };

function requiredKey(p: Pick<ProductProfile, "classes">): string | undefined {
  return p.classes.find((c) => c.role === "required")?.key;
}

/** One card per product category: last result, pass rate and one-click upload / live camera. */
export function ProductShortcuts({ profiles, items }: { profiles: ProductProfile[]; items: InspectionSummary[] }) {
  const products = profiles.filter((p) => requiredKey(p));
  if (!products.length) return null;
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {products.map((p) => {
        const Icon = ICONS[requiredKey(p) ?? ""] ?? Boxes;
        const mine = items.filter((i) => i.profileId === p.id);
        const pass = mine.filter((i) => i.decision === "PASS").length;
        const last = mine[0]?.decision as Decision | undefined;
        return (
          <div key={p.id} className="group relative flex items-center gap-3.5 rounded-lg border border-line bg-panel p-3.5 transition-colors hover:border-line-strong">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-raised text-fg">
              <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/inspection?source=upload&profile=${p.id}`} className="flex items-center gap-1 text-[14.5px] font-medium text-fg after:absolute after:inset-0">
                Inspect {p.name.toLowerCase()}
                <ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-subtle transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
              </Link>
              <p className="mt-0.5 truncate font-mono text-[11px] text-subtle">
                {mine.length ? `${mine.length} done · ${Math.round((pass / mine.length) * 100)}% pass` : "no records yet"}
                {last ? (
                  <>
                    {" · last "}
                    <span className={cn(last === "PASS" ? "text-pass" : last === "REJECT" ? "text-reject" : "text-review")}>{last}</span>
                  </>
                ) : null}
              </p>
            </div>
            <Link
              href={`/inspection?source=camera&profile=${p.id}`}
              aria-label={`Live camera for ${p.name}`}
              title="Live camera"
              className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-muted transition-colors hover:border-fg hover:text-fg"
            >
              <Camera aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/** Pass / reject / review split per product profile. */
export function ByProduct({ items }: { items: InspectionSummary[] }) {
  const groups = new Map<string, { name: string; n: Record<Decision, number> }>();
  for (const i of items) {
    const g = groups.get(i.profileId) ?? { name: i.profileName, n: { PASS: 0, REJECT: 0, REVIEW: 0 } };
    g.n[i.decision] += 1;
    groups.set(i.profileId, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.n.PASS + b.n.REJECT + b.n.REVIEW - (a.n.PASS + a.n.REJECT + a.n.REVIEW));
  if (!rows.length) return <p className="rounded-md bg-sunken py-8 text-center text-[13px] text-muted">No inspections yet.</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => {
        const total = r.n.PASS + r.n.REJECT + r.n.REVIEW;
        return (
          <li key={r.name}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-fg">{r.name}</span>
              <span className="tabular shrink-0 font-mono text-[11.5px] text-subtle">
                <span className="text-pass">{r.n.PASS}</span> / <span className="text-reject">{r.n.REJECT}</span> / <span className="text-review">{r.n.REVIEW}</span>
              </span>
            </div>
            <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${r.name}: ${r.n.PASS} pass, ${r.n.REJECT} reject, ${r.n.REVIEW} review`}>
              {(["PASS", "REJECT", "REVIEW"] as const)
                .filter((d) => r.n[d] > 0)
                .map((d) => (
                  <div key={d} style={{ width: `${(r.n[d] / total) * 100}%`, background: `var(--${d.toLowerCase()})` }} />
                ))}
            </div>
          </li>
        );
      })}
      <li className="pt-1 font-mono text-[11px] text-subtle">pass / reject / review</li>
    </ul>
  );
}
