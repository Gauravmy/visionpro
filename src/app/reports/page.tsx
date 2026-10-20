import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { FilterBar } from "@/components/history/FilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { DecisionBadge, EmptyState, KeyValue, Notice, Panel, buttonClass } from "@/components/ui/primitives";
import { bucketRange, classDistribution, computeTotals, localDayKey, volumeSeries } from "@/lib/analytics";
import { classLabel } from "@/lib/classes";
import { filterOptions, listDetectionFacts, listSummaries } from "@/lib/db/inspections";
import { formatDate, formatDateTime, formatDayKey, formatMs, formatPct } from "@/lib/format";
import { parseInspectionQuery } from "@/lib/validation";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const LIST_LIMIT = 500;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const options = filterOptions();
  const today = new Date();
  const monthStart = localDayKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const parsed = parseInspectionQuery(sp);
  const requested = typeof sp.from === "string" || typeof sp.to === "string";
  const q = parsed.success ? parsed.data : null;
  const from = q?.from;
  const to = q?.to;
  const missing = requested && (!from || !to);
  const invalid = !!(from && to && from > to);
  const ready = requested && parsed.success && !missing && !invalid;

  const filters = { from, to, profileId: q?.profileId, decision: q?.decision };
  const items = ready ? listSummaries(filters, 100000) : [];
  const facts = ready ? listDetectionFacts(filters) : [];
  const totals = computeTotals(items);
  const daily = ready ? volumeSeries(items, bucketRange(from!, to!, "day", 400), "day").filter((d) => d.total > 0) : [];
  const classes = classDistribution(facts);
  const profileName = q?.profileId ? (options.profiles.find((p) => p.id === q.profileId)?.name ?? q.profileId) : "All products";

  const exportQs = new URLSearchParams();
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);
  if (q?.profileId) exportQs.set("profileId", q.profileId);
  if (q?.decision) exportQs.set("decision", q.decision);

  return (
    <>
      <Panel className="no-print mb-4 p-4">
        <p className="mb-3 text-[13px] text-muted">
          Build a summary report for a date range. Per-inspection reports are available from each{" "}
          <Link href="/history" className="text-accent underline">
            inspection record
          </Link>
          .
        </p>
        <FilterBar
          action="/reports"
          values={{ from: from ?? monthStart, to: to ?? localDayKey(today), profileId: q?.profileId, decision: q?.decision }}
          options={options}
          fields={["from", "to", "profileId", "decision"]}
          submitLabel="Generate report"
        />
        {missing ? (
          <div className="mt-3">
            <Notice tone="error">Select both a start and an end date.</Notice>
          </div>
        ) : null}
        {invalid ? (
          <div className="mt-3">
            <Notice tone="error">The start date is after the end date.</Notice>
          </div>
        ) : null}
        {!parsed.success ? (
          <div className="mt-3">
            <Notice tone="error">Invalid report parameters. Check the dates.</Notice>
          </div>
        ) : null}
      </Panel>

      {!ready ? (
        <Panel className="no-print">
          <EmptyState icon={FileText} title="Choose a date range" compact>
            Select the period and, optionally, a product and decision, then generate the report.
          </EmptyState>
        </Panel>
      ) : totals.total === 0 ? (
        <Panel>
          <EmptyState icon={FileText} title="No inspections in this range" compact>
            No stored inspections match {formatDate(`${from}T12:00:00`)} – {formatDate(`${to}T12:00:00`)} ({profileName}
            {q?.decision ? `, ${q.decision}` : ""}). Nothing to export.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="no-print mb-4 flex flex-wrap justify-end gap-2">
            <a href={`/api/export?format=csv&${exportQs}`} className={buttonClass("secondary", "sm")}>
              <Download aria-hidden className="h-3.5 w-3.5" /> Export CSV ({totals.total})
            </a>
            <a href={`/api/export?format=json&${exportQs}`} className={buttonClass("secondary", "sm")}>
              <Download aria-hidden className="h-3.5 w-3.5" /> Export JSON
            </a>
            <PrintButton />
          </div>

          <article className="rounded-lg border border-line bg-panel p-6 text-[13px] print:border-0 print:p-0">
            <header className="border-b border-line pb-4">
              <p className="text-xs uppercase tracking-wider text-subtle">VisionInspect Pro · Inspection summary report</p>
              <h2 className="mt-1 text-lg font-semibold">
                {formatDate(`${from}T12:00:00`)} – {formatDate(`${to}T12:00:00`)}
              </h2>
              <p className="text-muted">
                {profileName}
                {q?.decision ? ` · decision ${q.decision}` : ""} · generated {formatDateTime(new Date().toISOString())}
              </p>
            </header>

            <section className="grid gap-6 border-b border-line py-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Outcomes</h3>
                <KeyValue
                  items={[
                    ["Inspections", totals.total],
                    ["PASS", `${totals.pass} (${formatPct(totals.passRate)})`],
                    ["REJECT", `${totals.reject} (${formatPct(totals.rejectRate)})`],
                    ["REVIEW", `${totals.review} (${formatPct(totals.reviewRate)})`],
                    ["Defects (review/reject level)", totals.defects],
                    ["Inspections without detector output", items.filter((i) => i.detectorStatus !== "ok").length],
                  ]}
                />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Defects by class</h3>
                {classes.length ? (
                  <KeyValue items={classes.map((c) => [classLabel(c.classKey), `${c.detections} in ${c.inspections} inspection(s)`])} />
                ) : (
                  <p className="text-muted">No defects detected.</p>
                )}
              </div>
            </section>

            <section className="print-break-avoid border-b border-line py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Daily breakdown (days with inspections)</h3>
              <table className="w-full max-w-xl text-left">
                <thead className="text-xs text-subtle">
                  <tr>
                    <th className="py-1 font-medium">Day</th>
                    <th className="py-1 text-right font-medium">Total</th>
                    <th className="py-1 text-right font-medium">PASS</th>
                    <th className="py-1 text-right font-medium">REJECT</th>
                    <th className="py-1 text-right font-medium">REVIEW</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {daily.map((d) => (
                    <tr key={d.key} className="border-t border-line/60">
                      <td className="py-1">{formatDayKey(d.key)}</td>
                      <td className="py-1 text-right">{d.total}</td>
                      <td className="py-1 text-right">{d.PASS}</td>
                      <td className="py-1 text-right">{d.REJECT}</td>
                      <td className="py-1 text-right">{d.REVIEW}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                Inspections{items.length > LIST_LIMIT ? ` (most recent ${LIST_LIMIT} of ${items.length}; export for the full list)` : ""}
              </h3>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead className="text-xs text-subtle">
                    <tr>
                      <th className="py-1 font-medium">ID</th>
                      <th className="py-1 font-medium">Time</th>
                      <th className="py-1 font-medium">Product</th>
                      <th className="py-1 font-medium">Decision</th>
                      <th className="py-1 font-medium">Defects</th>
                      <th className="py-1 text-right font-medium">Total time</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {items.slice(0, LIST_LIMIT).map((i) => (
                      <tr key={i.id} className="border-t border-line/60">
                        <td className="py-1 font-mono text-xs">
                          <Link href={`/inspection/${i.id}`} className="hover:text-accent">
                            {i.id}
                          </Link>
                        </td>
                        <td className="py-1">{formatDateTime(i.createdAt)}</td>
                        <td className="py-1">{i.profileName}</td>
                        <td className="py-1">
                          <DecisionBadge decision={i.decision} />
                        </td>
                        <td className="py-1">{i.defectCount ? `${i.defectCount} (${i.classes.map(classLabel).join(", ")})` : "0"}</td>
                        <td className="py-1 text-right">{formatMs(i.totalMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <footer className="border-t border-line pt-3 text-[11px] text-subtle">
              Operational statistics from stored records only. They do not measure model accuracy. Dates use the server&apos;s local time zone.
            </footer>
          </article>
        </>
      )}
    </>
  );
}
