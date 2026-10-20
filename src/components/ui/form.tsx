import type { ComponentProps, ReactNode } from "react";
import { cn } from "./primitives";

const control =
  "h-9 w-full rounded-md border border-line-strong bg-panel px-2.5 text-[13.5px] text-fg shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] placeholder:text-subtle transition-[border-color,box-shadow] hover:border-subtle focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-50 aria-[invalid=true]:border-reject";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs text-reject">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "h-auto min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "cursor-pointer pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/** Accessible on/off switch built on a native checkbox. */
export function Switch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-5 w-9 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="pointer-events-none h-5 w-9 rounded-full border border-line-strong bg-sunken transition-colors peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-50"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-subtle shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-ink-fg"
        />
      </span>
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="block text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-subtle">{description}</span> : null}
      </label>
    </div>
  );
}
