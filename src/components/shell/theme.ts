"use client";

import { THEME_KEY as KEY } from "./theme-script";
import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    setPrefState(readPref());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readPref() === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: still apply for this page view */
    }
    apply(next);
    setPrefState(next);
  }, []);

  const cycle = useCallback(() => {
    const order: ThemePref[] = ["light", "dark", "system"];
    setPref(order[(order.indexOf(pref) + 1) % order.length]);
  }, [pref, setPref]);

  return { pref, setPref, cycle };
}
