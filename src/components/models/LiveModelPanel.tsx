"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { classKey, classLabel } from "@/lib/classes";
import { formatDateTime } from "@/lib/format";
import { READINESS_LABEL, readinessOf, useBackendStatus } from "../shell/BackendStatus";
import { Button, KeyValue, Notice, Panel, PanelHeader, Skeleton, StatusDot, Tag } from "../ui/primitives";

export function LiveModelPanel({ profiles }: { profiles: Array<{ id: string; name: string; modelId: string; classKeys: string[] }> }) {
  const { state, refresh } = useBackendStatus();
  const [busy, setBusy] = useState(false);
  const r = readinessOf(state);

  return (
    <Panel>
      <PanelHeader
        title="Running model (live)"
        description="Reported by the inference service health endpoint"
        actions={
          <Button
            size="sm"
            onClick={async () => {
              setBusy(true);
              await refresh();
              setBusy(false);
            }}
            disabled={busy}
          >
            <RefreshCw aria-hidden className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Verify now
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        {state.phase === "loading" ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : state.phase === "unreachable" ? (
          <>
            <p className="flex items-center gap-2 font-medium">
              <StatusDot tone="error" /> {READINESS_LABEL[r]}
            </p>
            <Notice tone="error" title="Inference service unreachable">
              {state.message} Endpoint: <code className="text-fg">{state.endpoint || "not configured"}</code>. Last checked {formatDateTime(state.checkedAt)}.
            </Notice>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium">
              <StatusDot tone={r === "ready" ? "ok" : "warn"} /> {READINESS_LABEL[r]}
            </p>
            <KeyValue
              items={[
                ["Model ID", state.health.model.modelId],
                ["Version", state.health.model.modelVersion],
                ["Framework", state.health.model.framework],
                ["Weights artifact", state.health.model.weightsPresent ? "Present" : "Not found"],
                ["Loaded", state.health.model.loaded ? `Yes${state.health.model.loadMs !== null ? ` (load ${state.health.model.loadMs} ms)` : ""}` : "No"],
                ["Input resolution", `${state.health.model.imgsz} px`],
                ["OpenCV", state.health.quality.opencvVersion ?? "—"],
                ["Service version", state.health.version],
                ["Endpoint", state.endpoint],
                ["Last verified", `${formatDateTime(state.checkedAt)} (${state.latencyMs} ms)`],
              ]}
            />
            {!state.health.model.loaded ? (
              <Notice tone="warn" title="Detector not loaded">
                {state.health.model.error} Inspections are recorded as REVIEW with no AI prediction until trained weights are configured.
              </Notice>
            ) : (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Classes in loaded weights</p>
                <div className="flex flex-wrap gap-1.5">
                  {state.health.model.classes.map((c) => (
                    <Tag key={c}>{classLabel(classKey(c))}</Tag>
                  ))}
                </div>
              </div>
            )}
            {state.health.model.loaded ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Profile compatibility</p>
                <ul className="space-y-1.5 text-[13px]">
                  {profiles.map((p) => {
                    const modelMatch = classKey(p.modelId) === classKey(state.health.model.modelId);
                    const weightKeys = new Set(state.health.model.classes.map(classKey));
                    const missing = p.classKeys.filter((k) => !weightKeys.has(k));
                    const ok = modelMatch && missing.length === 0;
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-2">
                        <StatusDot tone={ok ? "ok" : "warn"} />
                        <span className="text-fg">{p.name}</span>
                        <span className="text-subtle">
                          {!modelMatch ? `expects model "${p.modelId}"` : missing.length ? `classes not in weights: ${missing.map(classLabel).join(", ")}` : "compatible"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
