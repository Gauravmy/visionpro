"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { HealthResponse } from "@/lib/inference/schemas";

export type HealthState =
  | { phase: "loading" }
  | { phase: "unreachable"; checkedAt: string; message: string; endpoint: string }
  | { phase: "ready"; checkedAt: string; latencyMs: number; health: HealthResponse; endpoint: string };

interface Ctx {
  state: HealthState;
  refresh: () => Promise<void>;
}

const BackendContext = createContext<Ctx | null>(null);

const POLL_MS = 30_000;

export function BackendStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HealthState>({ phase: "loading" });
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const body = await res.json();
      if (body.reachable) {
        setState({ phase: "ready", checkedAt: body.checkedAt, latencyMs: body.latencyMs, health: body.health, endpoint: body.endpoint });
      } else {
        setState({ phase: "unreachable", checkedAt: body.checkedAt, message: body.message, endpoint: body.endpoint });
      }
    } catch {
      setState({ phase: "unreachable", checkedAt: new Date().toISOString(), message: "Web server did not respond.", endpoint: "" });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return <BackendContext.Provider value={{ state, refresh }}>{children}</BackendContext.Provider>;
}

export function useBackendStatus(): Ctx {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error("useBackendStatus must be used inside BackendStatusProvider");
  return ctx;
}

export type Readiness = "checking" | "offline" | "model_unavailable" | "ready";

export function readinessOf(state: HealthState): Readiness {
  if (state.phase === "loading") return "checking";
  if (state.phase === "unreachable") return "offline";
  return state.health.model.loaded ? "ready" : "model_unavailable";
}

export const READINESS_LABEL: Record<Readiness, string> = {
  checking: "Checking backend…",
  offline: "Inference service offline",
  model_unavailable: "Model unavailable",
  ready: "Model ready",
};
