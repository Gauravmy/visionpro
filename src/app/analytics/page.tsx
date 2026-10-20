import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { BarList, DECISION_COLORS, SplitBar } from "@/components/charts/BarList";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { FilterBar } from "@/components/history/FilterBar";
import { ButtonLink, EmptyState, Notice, Panel, PanelHeader, Reading, cn } from "@/components/ui/primitives";
import {
  bucketRange,
  classDistribution,
  classTrend,
  computeTotals,
  localDayKey,
  productComparison,
  volumeSeries,
  type Granularity,
} from "@/lib/analytics";
import { classLabel, colorForClass, OTHER_COLOR } from "@/lib/classes";
import { filterOptions, listDetectionFacts, listSummaries } from "@/lib/db/inspections";
import { getProfile } from "@/lib/db/profiles";
import { getSettings } from "@/lib/db/settings";
import { formatDayKey, formatPct } from "@/lib/format";
import { parseInspectionQuery } from "@/lib/validation";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const MAX_BUCKETS = 400;

function NotEnough({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-md bg-sunken text-center text-[13px] text-muted">
      <p className="font-medium text-fg">Not enough data</p>
      <p className="mt-1 max-w-xs text-xs text-subtle">{children}</p>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const g: Granularity = sp.g === "week" ? "week" : "day";
  const today = new Date();
  const defaultFrom = localDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
  const parsed = parseInspectionQuery({ ...sp, g: undefined });
  const q = parsed.success ? parsed.data : null;
  const from = q?.from ?? defaultFrom;
  const to = q?.to ?? localDayKey(today);
  const invalidRange = from > to;
  const filters = { from, to, profileId: q?.profileId, decision: q?.decision, classKey: q?.classKey };

  const options = filterOptions();
  const items = invalidRange ? [] : listSummaries(filters);
  const facts = invalidRange ? [] : listDetectionFacts(filters);
  const totals = computeTotals(items);
  const allKeys = invalidRange ? [] : bucketRange(from, to, g, MAX_BUCKETS + 1);
  const truncated = allKeys.length > MAX_BUCKETS;
  const keys = allKeys.slice(-MAX_BUCKETS);
  const volume = volumeSeries(items, keys, g);
  const classes = classDistribution(facts);
  const trend = classTrend(facts, keys, g);
  const products = productComparison(items);

  const settings = getSettings();
  const profileForColors = getProfile(q?.profileId ?? settings.activeProfileId ?? "") ?? null;
  const classOrder = profileForColors?.classes.map((c) => c.key) ?? classes.map((c) => c.classKey);
  // Classes outside the colour slots fold into "Other" so no colour is generated on the fly.
  const colored = classes.map((c) => c.classKey).filter((k) => colorForClass(k, classOrder) !== OTHER_COLOR);
  const trendSeries = [
    ...colored.map((k) => ({ key: k, label: classLabel(k), color: colorForClass(k, classOrder) })),
    ...(classes.length > colored.length ? [{ key: "__other", label: "Other", color: OTHER_COLOR }] : []),
  ];
  const trendData = trend.map((t) => {
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(t.counts)) {
      const slot = colored.includes(k) ? k : "__other";
      values[slot] = (values[slot] ?? 0) + v;
    }
    return { key: t.key, label: g === "week" ? `Wk ${formatDayKey(t.key)}` : formatDayKey(t.key), values };
  });
  const bucketsWithData = volume.filter((b) => b.total > 0).length;
  const gHref = (next: Granularity) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "g") p.set(k, v);
    if (next === "week") p.set("g", "week");
    return `/analytics${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <Panel className="mb-4 p-4">
        <FilterBar
          action="/analytics"
          values={{ from, to, profileId: q?.profileId, decision: q?.decision, classKey: q?.classKey }}
          options={options}
          fields={["from", "to", "profileId", "classKey", "decision"]}
          hidden={{ g: g === "week" ? "week" : undefined }}
        />
        {invalidRange ? (
          <div className="mt-3">
            <Notice tone="error">The start date is after the end date.</Notice>
          </div>
        ) : null}
        {!parsed.success ? (
          <div className="mt-3">
            <Notice tone="warn">Some filter values were invalid and were ignored.</Notice>
          </div>
        ) : null}
      </Panel>

      <div className="mb-5">
        <Notice tone="info" title="Operational statistics, not model accuracy">
          These figures summarise stored inspection outcomes on this line. A high PASS rate does not show that the model is accurate: missed
          defects are not visible here. Model evaluation results are on{" "}
          <Link href="/models" className="text-accent underline">
            Models &amp; Performance
          </Link>
          .
        </Notice>
      </div>

      {totals.total === 0 ? (
        <Panel>
          <EmptyState icon={BarChart3} title="No inspections in this range" action={<ButtonLink href="/inspection" variant="primary">Run an inspection</ButtonLink>}>
            Adjust the filters, or run inspections to build up operational statistics.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <Panel className="mb-5 overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5 [&>*]:bg-panel [&>*]:px-5 [&>*]:py-4">
              <Reading label="Inspections" value={totals.total} sub={`${from} – ${to}`} />
              <Reading label="Pass rate" dot="bg-pass" value={formatPct(totals.passRate)} sub={`${totals.pass} of ${totals.total}`} />
              <Reading label="Reject rate" dot="bg-reject" value={formatPct(totals.rejectRate)} sub={`${totals.reject} of ${totals.total}`} />
              <Reading label="Review rate" dot="bg-review" value={formatPct(totals.reviewRate)} sub={`${totals.review} of ${totals.total}`} />
              <Reading label="Defects" value={totals.defects} sub={`${(totals.defects / totals.total).toFixed(2)} per inspection`} />
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader
                title={`Inspection volume (${g === "week" ? "weekly" : "daily"})`}
                description="Count by decision, local time"
                actions={
                  <div role="group" aria-label="Granularity" className="flex rounded-md bg-raised p-0.5 text-xs">
                    {(["day", "week"] as const).map((x) => (
                      <Link
                        key={x}
                        href={gHref(x)}
                        aria-current={g === x ? "true" : undefined}
                        className={cn("rounded px-2.5 py-1 font-medium", g === x ? "bg-panel text-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-muted hover:text-fg")}
                      >
                        {x === "day" ? "Daily" : "Weekly"}
                      </Link>
                    ))}
                  </div>
                }
              />
              <div className="p-4">
                {truncated ? <p className="mb-2 text-xs text-review">Showing the most recent {MAX_BUCKETS} periods. Switch to weekly or narrow the range.</p> : null}
                {bucketsWithData < 2 ? (
                  <NotEnough>Trends need inspections in at least two {g === "week" ? "weeks" : "days"} of the selected range.</NotEnough>
                ) : (
                  <StackedBarChart
                    caption="Inspection volume by decision"
                    series={[
                      { key: "PASS", label: "PASS", color: DECISION_COLORS.PASS },
                      { key: "REJECT", label: "REJECT", color: DECISION_COLORS.REJECT },
                      { key: "REVIEW", label: "REVIEW", color: DECISION_COLORS.REVIEW },
                    ]}
                    data={volume.map((b) => ({
                      key: b.key,
                      label: g === "week" ? `Wk ${formatDayKey(b.key)}` : formatDayKey(b.key),
                      values: { PASS: b.PASS, REJECT: b.REJECT, REVIEW: b.REVIEW },
                    }))}
                  />
                )}
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Decision distribution" description={`${totals.total} inspections`} />
              <div className="p-4">
                <SplitBar
                  total={totals.total}
                  parts={[
                    { key: "PASS", label: "PASS", value: totals.pass, color: DECISION_COLORS.PASS },
                    { key: "REJECT", label: "REJECT", value: totals.reject, color: DECISION_COLORS.REJECT },
                    { key: "REVIEW", label: "REVIEW", value: totals.review, color: DECISION_COLORS.REVIEW },
                  ]}
                />
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Panel>
              <PanelHeader title="Defect class distribution" description="Detections at review or reject level" />
              <div className="p-4">
                {classes.length === 0 ? (
                  <NotEnough>No defects were detected in this range.</NotEnough>
                ) : (
                  <BarList
                    caption="Detections by class"
                    items={classes.map((c) => ({
                      key: c.classKey,
                      label: classLabel(c.classKey),
                      value: c.detections,
                      color: colorForClass(c.classKey, classOrder),
                      detail: `${c.inspections} insp.`,
                    }))}
                  />
                )}
              </div>
            </Panel>
            <Panel className="xl:col-span-2">
              <PanelHeader title="Defect frequency over time" description={`Detections per ${g === "week" ? "week" : "day"} by class`} />
              <div className="p-4">
                {facts.length === 0 || trendData.filter((t) => Object.keys(t.values).length).length < 2 ? (
                  <NotEnough>Needs detections in at least two {g === "week" ? "weeks" : "days"}.</NotEnough>
                ) : (
                  <StackedBarChart caption="Defect detections over time by class" series={trendSeries} data={trendData} unit="detections" />
                )}
              </div>
            </Panel>
          </div>

          <Panel className="mt-4">
            <PanelHeader title="Product comparison" description="Outcome rates per product profile in the selected range" />
            {products.length < 2 ? (
              <NotEnough>Comparison needs inspections from at least two product profiles.</NotEnough>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left font-mono text-[10.5px] uppercase tracking-wider text-subtle">
                      <th scope="col" className="px-4 py-2 font-medium">Product</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Inspections</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">PASS</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">REJECT</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">REVIEW</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Defects / insp.</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {products.map((p) => (
                      <tr key={p.profileId} className="border-b border-line/60 last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-normal">{p.profileName}</th>
                        <td className="px-4 py-2 text-right">{p.totals.total}</td>
                        <td className="px-4 py-2 text-right">{formatPct(p.totals.passRate)}</td>
                        <td className="px-4 py-2 text-right">{formatPct(p.totals.rejectRate)}</td>
                        <td className="px-4 py-2 text-right">{formatPct(p.totals.reviewRate)}</td>
                        <td className="px-4 py-2 text-right">{(p.totals.defects / p.totals.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {products.some((p) => p.totals.total < 30) ? (
                  <p className="px-4 pb-3 text-xs text-subtle">Products with fewer than 30 inspections have unstable rates; compare with caution.</p>
                ) : null}
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

