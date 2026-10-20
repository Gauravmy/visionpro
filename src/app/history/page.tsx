import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, History, SearchX } from "lucide-react";
import { FilterBar } from "@/components/history/FilterBar";
import { HistoryTable } from "@/components/history/HistoryTable";
import { ButtonLink, EmptyState, Notice, Panel, buttonClass, cn } from "@/components/ui/primitives";
import { filterOptions, queryInspections } from "@/lib/db/inspections";
import { formatZodError, parseInspectionQuery, type InspectionQuery } from "@/lib/validation";

export const metadata: Metadata = { title: "Inspection history" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function hrefWith(base: SP, patch: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "" && k !== "ids") params.set(k, String(value));
  }
  const s = params.toString();
  return s ? `/history?${s}` : "/history";
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const parsed = parseInspectionQuery(sp);
  const options = filterOptions();
  const q: InspectionQuery = parsed.success ? parsed.data : { sort: "createdAt", dir: "desc", page: 1, pageSize: 20 };
  const rangeError = q.from && q.to && q.from > q.to ? "The start date is after the end date." : null;
  const result = queryInspections(q);
  const filtered = Boolean(q.q || q.from || q.to || q.profileId || q.classKey || q.decision);

  const sortHrefs = Object.fromEntries(
    (["createdAt", "decision", "defectCount", "profileName"] as const).map((f) => [
      f,
      hrefWith(sp, { sort: f, dir: q.sort === f && q.dir === "desc" ? "asc" : "desc", page: 1 }),
    ]),
  ) as Record<InspectionQuery["sort"], string>;

  const exportParams = new URLSearchParams();
  for (const k of ["q", "from", "to", "profileId", "classKey", "decision"] as const) if (q[k]) exportParams.set(k, String(q[k]));

  return (
    <>
      <Panel className="mb-4 p-4">
        <FilterBar
          action="/history"
          values={{ q: q.q, from: q.from, to: q.to, profileId: q.profileId, classKey: q.classKey, decision: q.decision }}
          options={options}
          hidden={{ sort: q.sort !== "createdAt" ? q.sort : undefined, dir: q.dir !== "desc" ? q.dir : undefined }}
        />
        {!parsed.success ? (
          <div className="mt-3">
            <Notice tone="error" title="Some filters were invalid and were ignored">
              {formatZodError(parsed.error)}
            </Notice>
          </div>
        ) : null}
        {rangeError ? (
          <div className="mt-3">
            <Notice tone="warn">{rangeError}</Notice>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <p className="text-[13px] text-muted">
            <span className="tabular font-medium text-fg">{result.total}</span> {result.total === 1 ? "inspection" : "inspections"}
            {filtered ? " match the filters" : " stored"}
          </p>
          {result.total > 0 ? (
            <div className="flex gap-2">
              <a href={`/api/export?format=csv&${exportParams}`} className={buttonClass("secondary", "sm")}>
                <Download aria-hidden className="h-3.5 w-3.5" /> Export all matching (CSV)
              </a>
              <a href={`/api/export?format=json&${exportParams}`} className={buttonClass("secondary", "sm")}>
                JSON
              </a>
            </div>
          ) : null}
        </div>

        {result.total === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="No inspections match these filters" action={<ButtonLink href="/history">Clear filters</ButtonLink>}>
              Widen the date range or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={History} title="No inspections yet" action={<ButtonLink href="/inspection" variant="primary">Run an inspection</ButtonLink>}>
              Completed inspections are stored here with their decision, detections and timings.
            </EmptyState>
          )
        ) : (
          <>
            <HistoryTable items={result.items} sort={q.sort} dir={q.dir} sortHrefs={sortHrefs} />
            <nav aria-label="Pagination" className="flex items-center justify-between gap-2 px-4 py-3 text-[13px] text-muted">
              <span className="tabular">
                Page {result.page} of {result.pageCount} · {(result.page - 1) * result.pageSize + 1}–{Math.min(result.total, result.page * result.pageSize)} of {result.total}
              </span>
              <div className="flex gap-2">
                <Link
                  href={hrefWith(sp, { page: result.page - 1 })}
                  aria-disabled={result.page <= 1}
                  tabIndex={result.page <= 1 ? -1 : undefined}
                  className={cn(buttonClass("secondary", "sm"), result.page <= 1 && "pointer-events-none opacity-40")}
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" /> Previous
                </Link>
                <Link
                  href={hrefWith(sp, { page: result.page + 1 })}
                  aria-disabled={result.page >= result.pageCount}
                  tabIndex={result.page >= result.pageCount ? -1 : undefined}
                  className={cn(buttonClass("secondary", "sm"), result.page >= result.pageCount && "pointer-events-none opacity-40")}
                >
                  Next <ChevronRight aria-hidden className="h-4 w-4" />
                </Link>
              </div>
            </nav>
          </>
        )}
      </Panel>
    </>
  );
}
