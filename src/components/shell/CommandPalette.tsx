"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Camera, CornerDownLeft, Download, Monitor, Moon, RefreshCw, Search, Sun, Upload } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { cn } from "../ui/primitives";
import type { ThemePref } from "./theme";

interface Command {
  id: string;
  group: "Go to" | "Actions" | "Appearance" | "Search";
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  shortcut?: string[];
  run: () => void;
}

function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const hay = `${cmd.label} ${cmd.keywords ?? ""} ${cmd.hint ?? ""}`.toLowerCase();
  const needle = q.toLowerCase();
  if (cmd.label.toLowerCase().startsWith(needle)) return 3;
  if (hay.includes(needle)) return 2;
  // loose subsequence match: "nwi" finds "New inspection"
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

export function CommandPalette({
  open,
  onClose,
  exportFormat,
  onTheme,
  onRecheck,
}: {
  open: boolean;
  onClose: () => void;
  exportFormat: string;
  onTheme: (t: ThemePref) => void;
  onRecheck: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setQ("");
      setActive(0);
      el.showModal();
      requestAnimationFrame(() => input.current?.focus());
    }
    if (!open && el.open) el.close();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const download = (href: string) => () => {
      window.location.href = href;
    };
    return [
      ...NAV_ITEMS.map<Command>((n) => ({
        id: `nav-${n.href}`,
        group: "Go to",
        label: n.title,
        hint: n.blurb,
        keywords: n.label,
        icon: <n.icon className="h-4 w-4" strokeWidth={1.75} />,
        shortcut: ["G", n.key.toUpperCase()],
        run: go(n.href),
      })),
      ...([
        ["qc-bottle", "bottle"],
        ["qc-charger", "charger"],
        ["qc-marker", "marker"],
      ] as const).map<Command>(([id, name]) => ({
        id: `inspect-${id}`,
        group: "Actions",
        label: `Inspect a ${name}`,
        hint: "Opens the live camera with this product selected",
        keywords: `${name} product camera live check`,
        icon: <Camera className="h-4 w-4" strokeWidth={1.75} />,
        run: go(`/inspection?source=camera&profile=${id}`),
      })),
      { id: "upload", group: "Actions", label: "Inspect an image file", keywords: "new upload run", icon: <Upload className="h-4 w-4" strokeWidth={1.75} />, shortcut: ["N"], run: go("/inspection?source=upload") },
      { id: "camera", group: "Actions", label: "Capture from camera", keywords: "webcam new photo", icon: <Camera className="h-4 w-4" strokeWidth={1.75} />, run: go("/inspection?source=camera") },
      { id: "export", group: "Actions", label: `Export all records (${exportFormat.toUpperCase()})`, keywords: "download csv json", icon: <Download className="h-4 w-4" strokeWidth={1.75} />, run: download(`/api/export?format=${exportFormat}`) },
      { id: "recheck", group: "Actions", label: "Re-check inference service", keywords: "health backend status model", icon: <RefreshCw className="h-4 w-4" strokeWidth={1.75} />, run: onRecheck },
      { id: "light", group: "Appearance", label: "Light theme", keywords: "theme mode", icon: <Sun className="h-4 w-4" strokeWidth={1.75} />, run: () => onTheme("light") },
      { id: "dark", group: "Appearance", label: "Dark theme", keywords: "theme mode night", icon: <Moon className="h-4 w-4" strokeWidth={1.75} />, run: () => onTheme("dark") },
      { id: "system", group: "Appearance", label: "Match system theme", keywords: "theme mode auto", icon: <Monitor className="h-4 w-4" strokeWidth={1.75} />, run: () => onTheme("system") },
    ];
  }, [router, exportFormat, onTheme, onRecheck]);

  const results = useMemo(() => {
    const term = q.trim();
    const found = commands
      .map((c) => ({ c, s: score(c, term) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    if (term) {
      found.push({
        id: "search",
        group: "Search",
        label: `Search history for “${term}”`,
        hint: "Matches inspection ID, file name and product",
        icon: <Search className="h-4 w-4" strokeWidth={1.75} />,
        run: () => router.push(`/history?q=${encodeURIComponent(term.slice(0, 64))}`),
      });
    }
    return found;
  }, [commands, q, router]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  let lastGroup = "";

  return (
    <dialog
      ref={dialog}
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-[12vh] w-[min(94vw,580px)] overflow-hidden rounded-xl border-0 bg-panel p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/35 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-subtle" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              runAt(active);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          placeholder="Jump to a page, run an action, or search an inspection ID…"
          className="h-13 w-full bg-transparent text-[14.5px] text-fg placeholder:text-subtle focus:outline-none"
        />
        <kbd>Esc</kbd>
      </div>
      <ul ref={list} id="cmd-list" role="listbox" aria-label="Commands" className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
        {results.length === 0 ? <li className="px-3 py-8 text-center text-[13px] text-subtle">Nothing matches.</li> : null}
        {results.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {header ? <p className="eyebrow px-2.5 pb-1 pt-2.5">{header}</p> : null}
              <div
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => runAt(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px]",
                  i === active ? "bg-raised text-fg" : "text-muted",
                )}
              >
                <span className={cn("shrink-0", i === active ? "text-fg" : "text-subtle")}>{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.label}</span>
                  {c.hint && i === active ? <span className="block truncate text-[12px] text-subtle">{c.hint}</span> : null}
                </span>
                {c.shortcut ? (
                  <span className="hidden shrink-0 items-center gap-1 sm:flex">
                    {c.shortcut.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                ) : i === active ? (
                  <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-subtle" />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-4 border-t border-line bg-sunken px-4 py-2 text-[11.5px] text-subtle">
        <span className="flex items-center gap-1.5">
          <kbd>↑</kbd>
          <kbd>↓</kbd> move
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>
            <CornerDownLeft className="inline h-2.5 w-2.5" />
          </kbd>{" "}
          open
        </span>
        <span className="ml-auto hidden sm:inline">
          Press <kbd>G</kbd> then a letter to jump anywhere
        </span>
      </div>
    </dialog>
  );
}
