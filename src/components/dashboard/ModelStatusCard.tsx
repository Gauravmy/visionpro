"use client";

import Link from "next/link";
import { KeyValue, Notice, Panel, PanelHeader, Skeleton, StatusDot } from "../ui/primitives";
import { READINESS_LABEL, readinessOf, useBackendStatus } from "../shell/BackendStatus";
import { formatDateTime } from "@/lib/format";

export function ModelStatusCard() {
  const { state } = useBackendStatus();
  const r = readinessOf(state);
  return (
    <Panel>
      <PanelHeader
        title="Model / backend status"
        description="Live health check of the inference service"
        actions={<Link href="/models" className="text-xs text-accent hover:underline">Details</Link>}
      />
      <div className="space-y-3 p-4">
        {state.phase === "loading" ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              <StatusDot tone={r === "ready" ? "ok" : r === "offline" ? "error" : "warn"} />
              {READINESS_LABEL[r]}
            </p>
            {state.phase === "unreachable" ? (
              <Notice tone="error">
                {state.message} Inspections still run and are stored as REVIEW with no detector or quality evidence. Start the service
                with <code className="text-fg">npm run inference</code> (see README).
              </Notice>
            ) : (
              <>
                <KeyValue
                  items={[
                    ["Model", state.health.model.modelId],
                    ["Version", state.health.model.modelVersion],
                    ["Weights", state.health.model.weightsPresent ? "Present" : "Not found"],
                    ["Classes", state.health.model.loaded ? state.health.model.classes.length : "—"],
                    ["OpenCV quality checks", state.health.quality.available ? `Available (${state.health.quality.opencvVersion})` : "Unavailable"],
                    ["Last checked", formatDateTime(state.checkedAt)],
                  ]}
                />
                {!state.health.model.loaded ? (
                  <Notice tone="warn" title="No detector loaded">
                    {state.health.model.error} Results are recorded as REVIEW until trained weights are configured.
                  </Notice>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
