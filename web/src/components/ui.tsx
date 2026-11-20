import clsx from "clsx";
import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { clamp01 } from "../lib/format";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-sage-bg px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sage-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-sage shadow-[0_0_0_3px_rgba(70,112,63,0.18)]" />
      {children}
    </span>
  );
}

/** Rounded segmented control (tab bar and small option pickers). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        "inline-flex max-w-full flex-wrap gap-1 bg-shell shadow-inset",
        size === "md" ? "rounded-[1.2rem] p-1" : "rounded-full p-[3px]",
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx(
              "inline-flex items-center gap-2 font-semibold transition-all duration-300 ease-soft disabled:cursor-not-allowed disabled:opacity-40",
              size === "md" ? "rounded-[0.95rem] px-4 py-2 text-[0.86rem]" : "rounded-full px-3 py-1 text-[0.78rem]",
              on ? "bg-surface text-sage-ink shadow-soft" : "text-ink-soft hover:bg-white/55 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-[0.8rem] transition-all duration-200 ease-soft hover:-translate-y-px",
        active
          ? "border-sage bg-sage-bg font-semibold text-sage-ink"
          : "border-line-strong bg-surface text-ink-soft hover:border-sage hover:text-sage-ink",
      )}
    >
      {children}
    </button>
  );
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "on" | "warn" | "info" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-[0.1em]",
        tone === "on" && "bg-sage-bg text-sage-ink",
        tone === "plain" && "bg-shell text-ink-soft",
        tone === "warn" && "bg-warn-bg text-warn-ink",
        tone === "info" && "bg-info-bg text-info-ink",
      )}
    >
      {children}
    </span>
  );
}

/** Horizontal meter; `marker` draws a threshold tick (e.g. tau). */
export function Meter({
  value,
  marker,
  tone = "sage",
  className,
  label,
}: {
  value: number;
  marker?: number | null;
  tone?: "sage" | "warn" | "mute";
  className?: string;
  label?: string;
}) {
  const v = clamp01(value);
  return (
    <div
      className={clsx("relative h-[0.35rem] rounded-full bg-shell", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(v.toFixed(3))}
      aria-label={label}
    >
      <span
        className={clsx(
          "block h-full rounded-full transition-[width] duration-500 ease-soft",
          tone === "sage" && "bg-sage",
          tone === "warn" && "bg-warn-ink/70",
          tone === "mute" && "bg-mute",
        )}
        style={{ width: `${v * 100}%` }}
      />
      {marker != null && (
        <span
          className="absolute -top-[3px] h-[calc(100%+6px)] w-[2px] rounded-full bg-ink"
          style={{ left: `calc(${clamp01(marker) * 100}% - 1px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  note,
  tone,
  children,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  note?: ReactNode;
  tone?: "good" | "warn";
  children?: ReactNode;
  delay?: number;
}) {
  return (
    <div className="card animate-fade-up px-[1.15rem] py-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="label-caps">{label}</div>
      <div
        className={clsx(
          "mt-1 font-serif text-[1.7rem] font-semibold leading-tight",
          tone === "good" && "text-sage-ink",
          tone === "warn" && "text-warn-ink",
        )}
      >
        {value} {sub && <small className="font-sans text-[0.85rem] font-medium text-ink-faint">{sub}</small>}
      </div>
      {note && <div className="mt-0.5 text-[0.76rem] text-ink-soft">{note}</div>}
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

export function Panel({
  num,
  title,
  pill,
  lead,
  children,
  id,
}: {
  num?: number;
  title: string;
  pill?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section className="mt-11 animate-fade-up" id={id} aria-label={title}>
      <div className="flex flex-wrap items-center gap-3">
        {num != null && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sage-deep text-[0.8rem] font-bold text-white">
            {num}
          </span>
        )}
        <h2 className="m-0 font-serif text-[1.3rem] font-semibold">{title}</h2>
        {pill}
      </div>
      {lead && <p className="mt-2 max-w-[75ch] text-[0.9rem] leading-relaxed text-ink-soft">{lead}</p>}
      {children}
    </section>
  );
}

export function Callout({
  tone = "plain",
  children,
  title,
}: {
  tone?: "note" | "warn" | "plain" | "info";
  children: ReactNode;
  title?: string;
}) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      role={tone === "warn" ? "alert" : "note"}
      className={clsx(
        "mt-4 flex animate-fade-up gap-3 rounded-md2 px-4 py-3.5 text-[0.9rem] leading-relaxed",
        tone === "note" && "bg-sage-bg text-sage-ink",
        tone === "warn" && "bg-warn-bg text-warn-ink",
        tone === "plain" && "bg-shell text-ink-soft",
        tone === "info" && "bg-info-bg text-info-ink",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <div>
        {title && <b className="font-bold">{title} </b>}
        {children}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  disabledHint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <label
      className={clsx("flex cursor-pointer items-start gap-3 py-1.5", disabled && "cursor-not-allowed opacity-50")}
      title={disabled ? disabledHint : undefined}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors duration-300 ease-soft",
          checked ? "bg-sage" : "bg-line-strong",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ease-soft",
            checked ? "translate-x-[1.1rem]" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="text-[0.86rem]">
        <span className="font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[0.78rem] text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="card mt-4 animate-fade-up overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full border-collapse text-[0.88rem]">{children}</table>
    </div>
  );
}

export const th =
  "whitespace-nowrap border-b border-line bg-paper/70 px-4 py-3 text-left text-[0.66rem] font-bold uppercase tracking-[0.1em] text-ink-faint";
export const td = "border-b border-line px-4 py-2.5 align-middle";
