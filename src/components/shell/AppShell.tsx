"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, Monitor, Moon, RefreshCw, Search, Sun, X } from "lucide-react";
import { BackendStatusProvider, READINESS_LABEL, readinessOf, useBackendStatus } from "./BackendStatus";
import { CommandPalette } from "./CommandPalette";
import { NAV_ITEMS, crumbsFor, isActive, navItemFor } from "./nav";
import { useTheme } from "./theme";
import { cn, IconButton, StatusDot, type Tone } from "../ui/primitives";

export interface ShellProfile {
  id: string;
  name: string;
  code: string;
}

function BrandMark() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="27" height="27" rx="6" className="fill-ink" />
      <path d="M7 11V7h4M21 11V7h-4M7 17v4h4M21 17v4h-4" className="stroke-ink-fg" strokeWidth="1.8" fill="none" strokeLinecap="square" />
      <rect x="11" y="11" width="6" height="6" fill="var(--marker)" />
    </svg>
  );
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

const readinessTone: Record<ReturnType<typeof readinessOf>, Tone> = {
  checking: "neutral",
  offline: "error",
  model_unavailable: "warn",
  ready: "ok",
};

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="w-[150px]" />;
  return (
    <time dateTime={now.toISOString()} className="tabular whitespace-nowrap">
      {now.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })} ·{" "}
      {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
    </time>
  );
}

function InferenceStatus() {
  const { state, refresh } = useBackendStatus();
  const r = readinessOf(state);
  const [spinning, setSpinning] = useState(false);
  const detail =
    state.phase === "unreachable"
      ? state.message
      : state.phase === "ready"
        ? state.health.model.loaded
          ? `${state.health.model.modelId} · ${state.latencyMs} ms`
          : `service up · ${state.latencyMs} ms · no weights`
        : "";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link href="/models" className="flex min-w-0 items-center gap-2 hover:text-fg" title={detail}>
        <StatusDot tone={readinessTone[r]} pulse={r === "ready"} />
        <span className="truncate text-fg">{READINESS_LABEL[r]}</span>
        {detail ? <span className="hidden truncate text-subtle md:inline">— {detail}</span> : null}
      </Link>
      <button
        type="button"
        aria-label="Re-check inference service"
        title="Re-check inference service"
        className="rounded p-1 text-subtle hover:bg-raised hover:text-fg"
        onClick={async () => {
          setSpinning(true);
          await refresh();
          setSpinning(false);
        }}
      >
        <RefreshCw className={cn("h-3 w-3", spinning && "animate-spin")} />
      </button>
    </div>
  );
}

function ProfileSwitcher({ profiles, activeProfileId }: { profiles: ShellProfile[]; activeProfileId: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="active-profile" className="text-subtle">
        Profile
      </label>
      <select
        id="active-profile"
        value={activeProfileId ?? ""}
        disabled={pending}
        aria-describedby={error ? "active-profile-error" : undefined}
        onChange={async (e) => {
          setPending(true);
          setError(null);
          const res = await fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activeProfileId: e.target.value }),
          });
          setPending(false);
          if (!res.ok) setError("Could not change profile");
          router.refresh();
        }}
        className="min-w-0 max-w-[13rem] cursor-pointer truncate rounded border-0 bg-transparent py-0.5 pr-1 font-mono text-[11.5px] text-fg underline decoration-line-strong decoration-dotted underline-offset-4 hover:decoration-fg sm:max-w-[22rem]"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.code}
          </option>
        ))}
      </select>
      {error ? (
        <span id="active-profile-error" role="alert" className="text-reject">
          {error}
        </span>
      ) : null}
    </div>
  );
}

const themeIcon = { light: Sun, dark: Moon, system: Monitor } as const;

function Header({
  profiles,
  activeProfileId,
  onOpenNav,
  onOpenPalette,
  theme,
}: {
  profiles: ShellProfile[];
  activeProfileId: string | null;
  onOpenNav: () => void;
  onOpenPalette: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const pathname = usePathname();
  const ThemeIcon = themeIcon[theme.pref];
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 lg:px-8">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 rounded-md">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
            VisionInspect<span className="ml-1 font-mono text-[10.5px] font-medium tracking-wider text-subtle">PRO</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden h-full lg:block">
          <ul className="flex h-full items-stretch gap-0.5">
            {NAV_ITEMS.filter((n) => n.href !== "/settings").map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href} className="relative flex">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "my-auto rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
                      active ? "font-medium text-fg" : "text-muted hover:bg-raised hover:text-fg",
                    )}
                  >
                    {label}
                  </Link>
                  {active ? <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-fg" /> : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden h-8 items-center gap-2 rounded-md border border-line-strong bg-panel pl-2.5 pr-1.5 text-[13px] text-subtle transition-colors hover:border-subtle hover:text-muted sm:flex"
          >
            <Search aria-hidden className="h-3.5 w-3.5" />
            <span className="w-28 text-left md:w-40">Search or jump…</span>
            <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <IconButton label="Search or jump" onClick={onOpenPalette} className="sm:hidden">
            <Search className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Theme: ${theme.pref} (click to change)`} onClick={theme.cycle}>
            <ThemeIcon className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
          <Link
            href="/settings"
            className={cn(
              "hidden h-8 items-center rounded-md px-2.5 text-[13.5px] transition-colors lg:flex",
              isActive(pathname, "/settings") ? "bg-raised font-medium text-fg" : "text-muted hover:bg-raised hover:text-fg",
            )}
          >
            Settings
          </Link>
          <IconButton label="Open menu" onClick={onOpenNav} className="lg:hidden">
            <Menu className="h-5 w-5" />
          </IconButton>
        </div>
      </div>

      <div className="border-t border-line bg-shell/70">
        <div className="mx-auto flex h-9 max-w-[1440px] items-center gap-4 px-4 font-mono text-[11.5px] text-muted lg:px-8">
          <ProfileSwitcher profiles={profiles} activeProfileId={activeProfileId} />
          <span aria-hidden className="h-3.5 w-px bg-line-strong" />
          <InferenceStatus />
          <span className="ml-auto hidden text-subtle sm:block">
            <Clock />
          </span>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="rise absolute inset-x-0 top-0 rounded-b-2xl border-b border-line bg-panel p-3 shadow-[var(--shadow-pop)]">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="eyebrow">Navigate</span>
          <IconButton label="Close menu" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {NAV_ITEMS.map(({ href, title, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-3 text-[14px]",
                    active ? "bg-ink text-ink-fg" : "text-fg hover:bg-raised",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PageTitle() {
  const pathname = usePathname();
  const { title, crumbs } = crumbsFor(pathname);
  const item = navItemFor(pathname);
  const isDetail = /^\/inspection\/.+/.test(pathname);
  return (
    <div className="no-print mb-5">
      {isDetail ? (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-subtle">
            {crumbs.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {c.href ? (
                  <Link href={c.href} className="truncate hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate text-muted">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">{title}</h1>
      {item ? <p className="mt-1 text-[13.5px] text-muted">{item.blurb}</p> : null}
    </div>
  );
}

function ShellBody({
  children,
  profiles,
  activeProfileId,
  exportFormat,
}: {
  children: ReactNode;
  profiles: ShellProfile[];
  activeProfileId: string | null;
  exportFormat: string;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const { refresh } = useBackendStatus();
  const pendingG = useRef<number | null>(null);

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setNavOpen(false);
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = NAV_ITEMS.find((n) => n.key === k);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (k === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
      } else if (k === "n") {
        e.preventDefault();
        router.push("/inspection?source=upload");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const recheck = useCallback(() => void refresh(), [refresh]);

  return (
    <>
      <a href="#main" className="sr-only z-50 rounded bg-ink px-3 py-2 text-ink-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col">
        <Header profiles={profiles} activeProfileId={activeProfileId} onOpenNav={() => setNavOpen(true)} onOpenPalette={() => setPaletteOpen(true)} theme={theme} />
        <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
        <main id="main" className="print-area relative mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <PageTitle />
          {children}
        </main>
        <footer className="no-print border-t border-line">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-4 font-mono text-[11px] text-subtle lg:px-8">
            <span>VisionInspect Pro 0.1 · local station · no sign-in, run on a trusted network</span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <kbd>N</kbd> new inspection <span className="mx-1">·</span> <kbd>G</kbd> + letter to jump
            </span>
          </div>
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} exportFormat={exportFormat} onTheme={theme.setPref} onRecheck={recheck} />
    </>
  );
}

export function AppShell({
  children,
  profiles,
  activeProfileId,
  exportFormat = "csv",
}: {
  children: ReactNode;
  profiles: ShellProfile[];
  activeProfileId: string | null;
  exportFormat?: string;
}) {
  return (
    <BackendStatusProvider>
      <ShellBody profiles={profiles} activeProfileId={activeProfileId} exportFormat={exportFormat}>
        {children}
      </ShellBody>
    </BackendStatusProvider>
  );
}
