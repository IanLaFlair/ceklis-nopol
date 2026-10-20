import type { TxStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/format";
import { Check } from "./icons";

/** Plat ditampilkan seperti plat asli: latar #F4F4F0, border hitam 2px, mono bold (PRD §12). */
export function Plate({ children, size = "md", accent = false }: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  accent?: boolean;
}) {
  const sizes = {
    sm: "text-[13px] px-2 py-0.5",
    md: "text-sm px-2 py-[3px]",
    lg: "text-[17px] px-2.5 py-1",
    xl: "text-[26px] px-4 py-1.5",
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded border-2 bg-plate font-mono font-bold text-ink ${accent ? "border-accent" : "border-ink"} ${sizes[size]}`}>
      {children}
    </span>
  );
}

const BADGE: Record<string, string> = {
  parked: "bg-warning-bg text-warning",
  incident_pending: "bg-danger-bg text-danger-ink",
  incident_confirmed: "bg-danger-bg text-danger-ink",
  released: "bg-success-bg text-success",
  pending: "bg-danger-bg text-danger-ink",
  confirmed: "bg-danger-bg text-danger-ink",
  dismissed: "bg-success-bg text-success",
  local: "bg-paper-2 text-muted border border-line",
};

export function Badge({ tone, children }: { tone: keyof typeof BADGE | string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold ${BADGE[tone] ?? BADGE.local}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TxStatus }) {
  return <Badge tone={status}>{STATUS_LABEL[status]}</Badge>;
}

export function Tick({ on, size = 30 }: { on: boolean; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-ink bg-accent" : "border-[#9A9F99] bg-surface"}`}>
      <Check size={size * 0.6} stroke={3.2} className={on ? "opacity-100" : "opacity-0"} />
    </span>
  );
}

export function Logo({ sub = "by nopol", size = 40 }: { sub?: string; size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden="true" style={{ width: size, height: size }} className="flex items-center justify-center rounded-[10px] bg-accent text-ink">
        <Check size={size * 0.55} stroke={2.4} />
      </span>
      <span className="flex flex-col leading-[1.1]">
        <span className="font-display text-2xl font-bold tracking-[-0.02em]">ceklis</span>
        <span className="text-xs text-on-ink-muted">{sub}</span>
      </span>
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg px-3.5 py-3 text-sm leading-normal text-danger-ink">
      {children}
    </p>
  );
}

export const field =
  "min-h-[52px] w-full rounded-xl border-[1.5px] border-field bg-surface px-3.5 text-base font-normal outline-none focus:border-ink";
export const label = "flex flex-col gap-2 text-sm font-semibold";
export const btnPrimary =
  "tap flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] bg-accent px-5 text-[17px] font-bold text-ink disabled:opacity-50";
export const btnDark =
  "tap flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-ink px-5 text-[17px] font-bold text-on-ink disabled:opacity-50";
export const btnGhost =
  "tap flex min-h-14 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-field bg-surface px-5 text-base font-semibold disabled:opacity-50";
export const chip = (on: boolean) =>
  `tap inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] px-3.5 text-sm ${on ? "border-ink bg-ink font-semibold text-on-ink" : "border-field bg-surface text-ink"}`;
