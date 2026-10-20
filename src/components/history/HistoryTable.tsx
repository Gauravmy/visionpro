"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, ImageOff, Trash2 } from "lucide-react";
import { formatDateTime, formatMs } from "@/lib/format";
import type { InspectionSummary } from "@/lib/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button, DecisionBadge, IconButton, Notice, Tag, cn } from "../ui/primitives";
import { ClassList } from "./RecentTable";

type SortField = "createdAt" | "decision" | "defectCount" | "profileName";

export function HistoryTable({
  items,
  sort,
  dir,
  sortHrefs,
}: {
  items: InspectionSummary[];
  sort: SortField;
  dir: "asc" | "desc";
  sortHrefs: Record<SortField, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drop selections that are no longer on the page (after filtering or deleting).
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => items.some((i) => i.id === id))));
  }, [items]);

  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = [...selected];
  const exportHref = (format: "csv" | "json") => `/api/export?format=${format}&ids=${encodeURIComponent(ids.join(","))}`;

  const doDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    for (const id of pendingDelete) {
      const res = await fetch(`/api/inspections/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) failed.push(id);
    }
    setBusy(false);
    setPendingDelete(null);
    if (failed.length) setError(`Could not delete: ${failed.join(", ")}`);
    router.refresh();
  };

  const SortHeader = ({ field, label, className }: { field: SortField; label: string; className?: string }) => {
    const active = sort === field;
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", className)}>
        <Link href={sortHrefs[field]} className={cn("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")}>
          {label}
          <Icon aria-hidden className="h-3 w-3" />
        </Link>
      </th>
    );
  };

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2 border-b border-line px-4 py-2", ids.length ? "bg-accent-wash" : "")} aria-live="polite">
        <span className="text-[13px] text-muted">{ids.length ? `${ids.length} selected` : "Select rows to export or delete them"}</span>
        {ids.length ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <a href={exportHref("csv")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-panel hover:bg-raised px-3 text-[13px] font-medium hover:border-subtle">
              <Download aria-hidden className="h-3.5 w-3.5" /> CSV
            </a>
            <a href={exportHref("json")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-panel hover:bg-raised px-3 text-[13px] font-medium hover:border-subtle">
              <Download aria-hidden className="h-3.5 w-3.5" /> JSON
            </a>
            <Button size="sm" variant="danger" onClick={() => setPendingDelete(ids)}>
              <Trash2 aria-hidden className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="px-4 pt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[10.5px] uppercase tracking-wider text-subtle">
              <th scope="col" className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)))}
                  className="h-4 w-4 cursor-pointer accent-[var(--ink)]"
                />
              </th>
              <th scope="col" className="px-3 py-2 font-medium">Inspection ID</th>
              <SortHeader field="createdAt" label="Time" />
              <SortHeader field="profileName" label="Product" />
              <SortHeader field="decision" label="Decision" />
              <SortHeader field="defectCount" label="Defects" />
              <th scope="col" className="px-3 py-2 font-medium">Max score</th>
              <th scope="col" className="px-3 py-2 font-medium">Model</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={cn("border-b border-line/60 hover:bg-raised/50", selected.has(i.id) && "bg-accent-wash")}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${i.id}`}
                    checked={selected.has(i.id)}
                    onChange={() => toggle(i.id)}
                    className="h-4 w-4 cursor-pointer accent-[var(--ink)]"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <Link href={`/inspection/${i.id}`} className="whitespace-nowrap font-mono text-xs text-accent hover:underline">
                      {i.id}
                    </Link>
                    {!i.imageAvailable ? <ImageOff aria-label="Image not retained" className="h-3.5 w-3.5 text-subtle" /> : null}
                  </span>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(i.createdAt)}</td>
                <td className="px-3 py-2 text-muted">{i.profileName}</td>
                <td className="px-3 py-2">
                  <DecisionBadge decision={i.decision} />
                </td>
                <td className="px-3 py-2 text-muted">
                  <span className="tabular text-fg">{i.defectCount}</span>
                  {i.defectCount ? (
                    <span className="ml-2 text-xs">
                      <ClassList classes={i.classes} />
                    </span>
                  ) : null}
                </td>
                <td className="tabular px-3 py-2 text-muted">{i.maxConfidence === null ? "—" : i.maxConfidence.toFixed(2)}</td>
                <td className="px-3 py-2">{i.detectorStatus === "ok" ? <span className="text-muted">{i.modelId}</span> : <Tag tone="warn">Unavailable</Tag>}</td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right text-muted">{formatMs(i.totalMs)}</td>
                <td className="px-3 py-2 text-right">
                  <IconButton label={`Delete ${i.id}`} onClick={() => setPendingDelete([i.id])}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete && pendingDelete.length > 1 ? `Delete ${pendingDelete.length} inspections?` : `Delete ${pendingDelete?.[0] ?? ""}?`}
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={doDelete}
      >
        The selected records, their detections and stored images will be permanently removed. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
