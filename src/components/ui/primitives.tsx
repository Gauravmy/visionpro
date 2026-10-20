import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CircleHelp, XCircle } from "lucide-react";
import type { Decision } from "@/lib/types";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-ink-fg hover:bg-ink/85 shadow-[inset_0_-1px_0_rgb(0_0_0/0.25)]",
  secondary: "border border-line-strong bg-panel text-fg hover:border-subtle hover:bg-raised",
  ghost: "text-muted hover:bg-raised hover:text-fg",
  danger: "border border-reject/40 bg-panel text-reject hover:bg-reject-wash hover:border-reject/70",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13.5px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function IconButton({ label, className, children, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Panels ---------- */

export function Panel({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-panel shadow-[var(--shadow-panel)]", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
  as: Tag = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-3.5", className)}>
      <div className="min-w-0">
        <Tag className="text-[14px] font-semibold tracking-[-0.005em] text-fg">{title}</Tag>
        {description ? <p className="mt-0.5 text-[12.5px] text-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Intro row under the page title: one-line purpose plus page actions.
 *  Without text, the actions move up beside the page title on wide screens. */
export function PageIntro({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  if (!children) {
    return actions ? <div className="no-print mb-6 flex flex-wrap items-center gap-2 lg:absolute lg:right-8 lg:top-[38px] lg:mb-0">{actions}</div> : null;
  }
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted">{children}</p>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ---------- Status ---------- */

const decisionStyle: Record<Decision, string> = {
  PASS: "text-pass border-pass/45 bg-pass-wash",
  REJECT: "text-reject border-reject/45 bg-reject-wash",
  REVIEW: "text-review border-review/50 bg-review-wash",
};
const decisionDot: Record<Decision, string> = { PASS: "bg-pass", REJECT: "bg-reject", REVIEW: "bg-review" };

/** Stamp-style decision mark: monospaced, squared, the same in tables and on reports. */
export function DecisionBadge({ decision, size = "sm", label }: { decision: Decision; size?: "sm" | "lg"; /** Replaces the decision text, e.g. "OUT OF RANGE". */ label?: string }) {
  if (size === "lg") {
    return (
      <span
        className={cn(
          "print-keep-color inline-flex items-center gap-2.5 rounded-[4px] border-2 px-3 py-1.5 font-mono text-[19px] font-medium tracking-[0.14em]",
          decisionStyle[decision],
        )}
      >
        <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", decisionDot[decision])} />
        {label ?? decision}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "print-keep-color inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] font-mono text-[10.5px] font-medium leading-none tracking-[0.1em]",
        decisionStyle[decision],
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", decisionDot[decision])} />
      {label ?? decision}
    </span>
  );
}

export type Tone = "ok" | "warn" | "error" | "neutral" | "info";
const toneDot: Record<Tone, string> = {
  ok: "bg-pass",
  warn: "bg-review",
  error: "bg-reject",
  neutral: "bg-subtle",
  info: "bg-accent",
};

export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
      {pulse ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", toneDot[tone])} /> : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", toneDot[tone])} />
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    ok: "bg-pass-wash text-pass",
    warn: "bg-review-wash text-review",
    error: "bg-reject-wash text-reject",
    neutral: "bg-raised text-muted",
    info: "bg-accent-wash text-accent",
  };
  return <span className={cn("inline-flex items-center rounded-[3px] px-1.5 py-[3px] font-mono text-[10.5px] font-medium leading-none tracking-wide", tones[tone])}>{children}</span>;
}

/* ---------- Feedback ---------- */

export function EmptyState({
  icon: Icon = CircleHelp,
  title,
  children,
  action,
  compact,
}: {
  icon?: typeof CircleHelp;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16")}>
      <div className="relative mb-4 flex h-12 w-12 items-center justify-center text-subtle">
        <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-line-strong" />
        <Icon aria-hidden className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {children ? <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error"; title?: string; children: ReactNode }) {
  const bar = { info: "border-l-accent", warn: "border-l-review", error: "border-l-reject" }[tone];
  const Icon = tone === "info" ? CircleHelp : tone === "warn" ? AlertTriangle : XCircle;
  const iconColor = tone === "info" ? "text-accent" : tone === "warn" ? "text-review" : "text-reject";
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("flex gap-2.5 rounded-md border border-line border-l-[3px] bg-sunken px-3 py-2.5 text-[13px]", bar)}>
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
      <div className="min-w-0 leading-relaxed text-muted">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/* ---------- Data display ---------- */

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn("text-[13px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-4 border-b border-dashed border-line py-1.5 last:border-0">
          <dt className="text-subtle">{k}</dt>
          <dd className="tabular min-w-0 break-words text-right text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Big monospaced reading with a label, used for KPI strips and result summaries. */
export function Reading({ label, value, sub, dot, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; dot?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow flex items-center gap-1.5">
        {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dot)} /> : null}
        {label}
      </p>
      <p className="tabular mt-1.5 truncate font-mono text-[26px] font-medium leading-none tracking-[-0.02em] text-fg">{value}</p>
      {sub ? <p className="tabular mt-1.5 truncate text-[12px] text-subtle">{sub}</p> : null}
    </div>
  );
}
