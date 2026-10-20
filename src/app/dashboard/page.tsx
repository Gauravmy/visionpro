import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Camera, Download, Upload } from "lucide-react";
import { BarList, DECISION_COLORS, SplitBar } from "@/components/charts/BarList";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { ModelStatusCard } from "@/components/dashboard/ModelStatusCard";
import { ByProduct, ProductShortcuts } from "@/components/dashboard/ProductShortcuts";
import { StationChecklist } from "@/components/dashboard/StationChecklist";
import { RecentTable } from "@/components/history/RecentTable";
import { ButtonLink, Panel, PanelHeader, PageIntro, Reading, buttonClass, cn } from "@/components/ui/primitives";
import { bucketRange, classDistribution, computeTotals, localDayKey, volumeSeries } from "@/lib/analytics";
import { classLabel, colorForClass } from "@/lib/classes";
import { listEvents } from "@/lib/db/events";
import { listDetectionFacts, listSummaries } from "@/lib/db/inspections";
import { getProfile, listProfiles } from "@/lib/db/profiles";
import { getSettings } from "@/lib/db/settings";
import { formatDateTime, formatDayKey, formatPct, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Line drawing of a strip passing under the camera frame. Decorative. */
function ScanIllustration() {
  return (
    <svg viewBox="0 0 320 150" className="h-auto w-full max-w-[460px]" aria-hidden>
      <defs>
        <pattern id="strip-grain" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-strong)" strokeWidth="1" />
        </pattern>
      </defs>
      <path d="M10 112 L250 112 L310 82 L70 82 Z" fill="var(--raised)" stroke="var(--line-strong)" />
      <path d="M10 112 L250 112 L310 82 L70 82 Z" fill="url(#strip-grain)" opacity="0.6" />
      <path d="M10 112 L250 112 L250 120 L10 120 Z" fill="var(--line)" />
      <path d="M250 112 L310 82 L310 90 L250 120 Z" fill="var(--line-strong)" />
      <path d="M150 96 q8 -4 16 1 q6 3 12 -1" stroke="var(--reject)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="138" y="86" width="52" height="20" fill="none" stroke="var(--reject)" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="164" y1="20" x2="164" y2="84" stroke="var(--subtle)" strokeDasharray="2 3" />
      <rect x="146" y="8" width="36" height="16" rx="3" fill="var(--ink)" />
      <circle cx="164" cy="16" r="4" fill="var(--marker)" />
      <path d="M120 80 L132 80 M120 80 L120 86 M208 80 L196 80 M208 80 L208 86" stroke="var(--fg)" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function DashboardPage() {
  const items = listSummaries({});
  const facts = listDetectionFacts({});
  const totals = computeTotals(items);
  const events = listEvents(8);
  const settings = getSettings();
  const active = settings.activeProfileId ? getProfile(settings.activeProfileId) : null;
  const classOrder = active?.classes.map((c) => c.key) ?? [];

  const today = new Date();
  const from = localDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13));
  const keys = bucketRange(from, localDayKey(today), "day");
  const volume = volumeSeries(items, keys, "day");
  const classes = classDistribution(facts);
  const exportHref = `/api/export?format=${settings.exportFormat}`;
  const profiles = listProfiles();
  const last24 = items.filter((i) => i.createdAt >= new Date(Date.now() - 86400000).toISOString()).length;

  const quickActions = (
    <>
      {totals.total > 0 ? (
        <a href={exportHref} className={buttonClass("ghost")}>
          <Download aria-hidden className="h-4 w-4" /> Export {settings.exportFormat.toUpperCase()}
        </a>
      ) : null}
      <ButtonLink href="/inspection?source=camera">
        <Camera aria-hidden className="h-4 w-4" /> Camera
      </ButtonLink>
      <ButtonLink href="/inspection?source=upload" variant="primary">
        <Upload aria-hidden className="h-4 w-4" /> Inspect image
        <kbd className="ml-1 hidden border-white/20 sm:inline bg-white/10 text-current opacity-70 dark:border-black/20 dark:bg-black/10">N</kbd>
      </ButtonLink>
    </>
  );

  if (totals.total === 0) {
    return (
      <>
        <PageIntro actions={quickActions} />
        <ProductShortcuts profiles={profiles} items={items} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Link
            href="/inspection?source=upload"
            className="group relative flex min-h-[360px] flex-col justify-between overflow-hidden rounded-lg border border-dashed border-line-strong bg-panel p-6 transition-colors hover:border-fg/40 lg:p-8"
          >
            <div>
              <p className="eyebrow">Nothing on record yet</p>
              <h2 className="mt-2 max-w-md text-[22px] font-semibold leading-snug tracking-[-0.015em] text-fg">
                Run your first inspection — one part image is enough to see how decisions are made.
              </h2>
              <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
                Every result lists the rule that produced it, the detections behind it and the image-quality readings. Charts and trends fill in
                here as records accumulate.
              </p>
            </div>
            <div className="mt-6 flex flex-col items-start gap-8">
              <ScanIllustration />
              <span className={cn(buttonClass("primary"), "group-hover:bg-ink/85")}>
                Start an inspection <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
          <div className="space-y-5">
            <Panel>
              <StationChecklist profileName={active ? `${active.name} · ${active.code}` : null} inspections={0} />
            </Panel>
            <ModelStatusCard />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageIntro actions={quickActions} />
      <ProductShortcuts profiles={profiles} items={items} />

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 xl:grid-cols-6 [&>*]:bg-panel [&>*]:px-5 [&>*]:py-4">
          <Reading label="Inspections" value={totals.total} sub={`${last24} in the last 24 h`} />
          <Reading label="Pass rate" dot="bg-pass" value={formatPct(totals.passRate)} sub={`${totals.pass} passed`} />
          <Reading label="Rejected" dot="bg-reject" value={totals.reject} sub={formatPct(totals.rejectRate)} />
          <Reading label="For review" dot="bg-review" value={totals.review} sub={formatPct(totals.reviewRate)} />
          <Reading label="Defects found" value={totals.defects} sub="at review or reject level" />
          <Reading label="Last inspection" value={totals.latest ? <span className="text-[20px]">{relativeTime(totals.latest)}</span> : "—"} sub={totals.latest ? formatDateTime(totals.latest) : undefined} />
        </div>
        <div className="border-t border-line px-5 py-4">
          <SplitBar
            total={totals.total}
            parts={[
              { key: "PASS", label: "Pass", value: totals.pass, color: DECISION_COLORS.PASS },
              { key: "REJECT", label: "Reject", value: totals.reject, color: DECISION_COLORS.REJECT },
              { key: "REVIEW", label: "Review", value: totals.review, color: DECISION_COLORS.REVIEW },
            ]}
            inline
          />
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Last 14 days" description="Inspections per day, split by decision (local time)" />
          <div className="px-4 pb-4">
            <StackedBarChart
              caption="Inspections per day by decision, last 14 days"
              series={[
                { key: "PASS", label: "Pass", color: DECISION_COLORS.PASS },
                { key: "REJECT", label: "Reject", color: DECISION_COLORS.REJECT },
                { key: "REVIEW", label: "Review", color: DECISION_COLORS.REVIEW },
              ]}
              data={volume.map((b) => ({ key: b.key, label: formatDayKey(b.key), values: { PASS: b.PASS, REJECT: b.REJECT, REVIEW: b.REVIEW } }))}
            />
          </div>
        </Panel>
        <ModelStatusCard />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="By product" description="Decisions per product profile" />
          <div className="px-4 pb-4">
            <ByProduct items={items} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Detections"
            description="Classes that triggered review or reject"
            actions={
              <Link href="/analytics" className="text-[12.5px] text-accent hover:underline">
                Analytics →
              </Link>
            }
          />
          <div className="px-4 pb-4">
            {classes.length === 0 ? (
              <p className="rounded-md bg-sunken py-8 text-center text-[13px] text-muted">No defects detected in stored inspections.</p>
            ) : (
              <BarList
                caption="Detections per defect class"
                items={classes.slice(0, 6).map((c) => ({
                  key: c.classKey,
                  label: classLabel(c.classKey),
                  value: c.detections,
                  color: colorForClass(c.classKey, classOrder),
                  detail: `${c.inspections} insp.`,
                }))}
              />
            )}
            <p className="mt-4 text-[12px] text-subtle">A high pass rate describes line output, not model accuracy — see Models for evaluation results.</p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Activity" description="Logged by this station" />
          <ol className="relative px-4 pb-3">
            <span aria-hidden className="absolute bottom-5 left-[21px] top-2 w-px bg-line" />
            {events.map((e) => (
              <li key={e.id} className="relative flex gap-3 py-1.5 text-[13px]">
                <span aria-hidden className="relative z-10 mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full border-2 border-panel bg-line-strong ring-1 ring-line-strong" />
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-fg">
                    {e.inspectionId ? (
                      <Link href={`/inspection/${e.inspectionId}`} className="hover:text-accent">
                        {e.message}
                      </Link>
                    ) : (
                      e.message
                    )}
                  </p>
                  <span className="tabular shrink-0 font-mono text-[11px] text-subtle">{relativeTime(e.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel className="mt-5">
        <PanelHeader
          title="Recent inspections"
          actions={
            <ButtonLink href="/history" size="sm" variant="ghost">
              All history →
            </ButtonLink>
          }
        />
        <RecentTable items={items.slice(0, 8)} />
      </Panel>
    </>
  );
}
