"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./primitives";

/** Modal confirmation built on the native <dialog> element (focus trapping and Esc handling included). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  tone = "danger",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "danger" | "primary";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(92vw,420px)] rounded-lg border border-line-strong bg-panel p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/60"
    >
      <div className="p-5">
        <h2 id="confirm-title" className="text-base font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
        <Button variant="ghost" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button variant={tone} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
