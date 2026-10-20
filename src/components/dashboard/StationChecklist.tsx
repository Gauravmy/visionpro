"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Minus, X } from "lucide-react";
import { useBackendStatus } from "../shell/BackendStatus";
import { cn } from "../ui/primitives";

type Status = "done" | "todo" | "fail" | "pending";

function Mark({ s }: { s: Status }) {
  const cls = {
    done: "bg-pass text-white",
    todo: "border border-dashed border-line-strong text-transparent",
    fail: "bg-reject-wash text-reject",
    pending: "skeleton",
  }[s];
  return (
    <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", cls)}>
      {s === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : s === "fail" ? <X className="h-3 w-3" strokeWidth={3} /> : s === "todo" ? <Minus className="h-3 w-3" /> : null}
    </span>
  );
}

/** Live readiness checklist shown on an empty station. */
export function StationChecklist({ profileName, inspections }: { profileName: string | null; inspections: number }) {
  const { state } = useBackendStatus();
  const loading = state.phase === "loading";
  const reachable = state.phase === "ready";
  const loaded = state.phase === "ready" && state.health.model.loaded;

  const steps: Array<{ label: string; detail: string; status: Status; href?: string; optional?: boolean }> = [
    {
      label: "Product profile selected",
      detail: profileName ?? "Create a profile with the classes you inspect for",
      status: profileName ? "done" : "todo",
      href: "/products",
    },
    {
      label: "Inference service reachable",
      detail: loading ? "Checking…" : reachable ? `${state.endpoint}` : "Start it with npm run inference",
      status: loading ? "pending" : reachable ? "done" : "fail",
      href: "/models",
    },
    {
      label: "Detector weights loaded",
      detail: loading ? "Checking…" : loaded ? "Defects will be detected and scored" : "Optional. Without weights every result is REVIEW",
      status: loading ? "pending" : loaded ? "done" : "todo",
      href: "/models",
      optional: true,
    },
    {
      label: "First inspection stored",
      detail: inspections ? `${inspections} on record` : "Upload or capture one part image",
      status: inspections ? "done" : "todo",
      href: "/inspection",
    },
  ];
  const done = steps.filter((s) => s.status === "done").length;

  return (
    <div>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-3.5">
        <h2 className="text-[14px] font-semibold text-fg">Station setup</h2>
        <span className="tabular font-mono text-[11.5px] text-subtle">
          {done}/{steps.length} ready
        </span>
      </div>
      <div className="mx-4 mb-1 h-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-pass transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="p-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href ?? "#"} className="group flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-raised">
              <Mark s={s.status} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13.5px] text-fg">
                  {s.label}
                  {s.optional ? <span className="text-[11px] text-subtle">optional</span> : null}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11.5px] text-subtle">{s.detail}</span>
              </span>
              <ArrowUpRight aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
