import Link from "next/link";
import { classLabel } from "@/lib/classes";
import { formatDateTime, formatMs } from "@/lib/format";
import type { InspectionSummary } from "@/lib/types";
import { DecisionBadge } from "../ui/primitives";

export function ClassList({ classes }: { classes: string[] }) {
  if (!classes.length) return <span className="text-subtle">None</span>;
  return <span>{classes.map(classLabel).join(", ")}</span>;
}

/** Read-only compact table of inspections. */
export function RecentTable({ items }: { items: InspectionSummary[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[10.5px] uppercase tracking-wider text-subtle">
            <th scope="col" className="px-4 py-2 font-medium">Inspection ID</th>
            <th scope="col" className="px-4 py-2 font-medium">Time</th>
            <th scope="col" className="px-4 py-2 font-medium">Product</th>
            <th scope="col" className="px-4 py-2 font-medium">Decision</th>
            <th scope="col" className="px-4 py-2 font-medium">Defects</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Total time</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-line/60 last:border-0 hover:bg-raised/50">
              <td className="px-4 py-2">
                <Link href={`/inspection/${i.id}`} className="whitespace-nowrap font-mono text-xs text-accent hover:underline">
                  {i.id}
                </Link>
              </td>
              <td className="tabular whitespace-nowrap px-4 py-2 text-muted">{formatDateTime(i.createdAt)}</td>
              <td className="px-4 py-2 text-muted">{i.profileName}</td>
              <td className="px-4 py-2">
                <DecisionBadge decision={i.decision} />
              </td>
              <td className="px-4 py-2 text-muted">
                <span className="tabular text-fg">{i.defectCount}</span>
                {i.defectCount ? (
                  <span className="ml-2 text-xs">
                    <ClassList classes={i.classes} />
                  </span>
                ) : null}
              </td>
              <td className="tabular px-4 py-2 text-right text-muted">{formatMs(i.totalMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
