import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Music2, Film } from "lucide-react";
import type { Kind } from "../api";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-black hover:bg-[#e6e6e6] active:bg-[#d4d4d4]",
  secondary: "bg-raised text-ink hover:bg-nested active:bg-[#333]",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  danger: "bg-negative-pale text-negative hover:bg-[#3a2029]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-8 px-3 text-small gap-1.5" : "h-9 px-4 text-body gap-2";
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40 ${sz} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-faint transition-colors duration-100 hover:bg-raised hover:text-ink active:bg-nested disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "negative" | "warning"; children: ReactNode }) {
  const tones = {
    neutral: "bg-nested text-ink",
    accent: "bg-accent-pale text-accent",
    negative: "bg-negative-pale text-negative",
    warning: "bg-warning-pale text-warning",
  };
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-small font-medium whitespace-nowrap tnum ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Cover art or video thumbnail; falls back to a quiet glyph on the surface. */
export function Thumb({ src, kind, className = "", fit = "cover" }: { src: string | null; kind: Kind; className?: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`relative shrink-0 overflow-hidden bg-raised ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className={`absolute inset-0 size-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-control">
          {kind === "audio" ? <Music2 size={20} /> : <Film size={20} />}
        </div>
      )}
    </div>
  );
}

export function Progress({ value, indeterminate = false, className = "" }: { value: number; indeterminate?: boolean; className?: string }) {
  return (
    <div
      className={`relative h-1 overflow-hidden rounded-full bg-nested ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
    >
      {indeterminate ? (
        <div className="indeterminate absolute inset-y-0 w-2/5 rounded-full bg-accent" />
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${Math.max(2, value * 100)}%` }} />
      )}
    </div>
  );
}

/** A popover menu anchored under its trigger. Closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = "left",
  width = 240,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={`pop-in absolute top-full z-40 mt-2 rounded-2xl bg-raised p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${align === "right" ? "right-0" : "left-0"}`}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  selected,
  danger,
  hint,
}: {
  children: ReactNode;
  onClick: () => void;
  selected?: boolean;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-body transition-colors hover:bg-nested ${danger ? "text-negative" : selected ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate">{children}</span>
      {hint && <span className="text-small text-faint tnum">{hint}</span>}
      {selected && <span className="size-1.5 rounded-full bg-ink" />}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-ink" : "bg-control"}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full transition-transform duration-150 ${checked ? "translate-x-[18px] bg-black" : "translate-x-0.5 bg-[#bbb]"}`}
      />
    </button>
  );
}

export function KindIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  return kind === "audio" ? <Music2 size={size} /> : <Film size={size} />;
}
