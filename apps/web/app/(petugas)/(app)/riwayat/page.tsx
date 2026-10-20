"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Screen } from "@/components/petugas/shell";
import { useSession } from "@/components/petugas/session";
import { Badge } from "@/components/ui";
import { fetcher } from "@/lib/api/client";
import { clock, duration } from "@/lib/format";
import type { TxStatus } from "@/lib/types";

interface HistoryEvent {
  transaction_id: number;
  plate: string;
  post: string;
  status: TxStatus;
  slot: string | null;
  make_model: string | null;
  kind: "in" | "out" | "incident";
  at: string;
  incident_code?: string | null;
  duration_minutes?: number;
}

interface History {
  summary: { checkin: number; checkout: number; incident: number };
  events: HistoryEvent[];
}

const PERIODS = [
  { id: "today", label: "Hari ini" },
  { id: "yesterday", label: "Kemarin" },
  { id: "7d", label: "7 hari" },
] as const;

const KIND = {
  in: { short: "IN", label: "Check in", icon: "bg-accent text-ink" },
  out: { short: "OUT", label: "Check out", icon: "bg-ink text-on-ink" },
  incident: { short: "!", label: "Insiden", icon: "bg-danger-bg text-danger-ink border border-danger" },
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hari ini";
  if (d.toDateString() === y.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
}

export default function RiwayatPage() {
  const { assignment } = useSession();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("today");
  const { data, error } = useSWR<History>(`/me/history?period=${period}`, fetcher);

  const groups: { label: string; items: HistoryEvent[] }[] = [];
  for (const e of data?.events ?? []) {
    const label = dayLabel(e.at);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <Screen
      header={
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-on-ink-muted">Pemeriksaan oleh kamu · {assignment.active!.post.name}</span>
            <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">Riwayat</h1>
          </div>
          <div role="group" aria-label="Periode" className="grid grid-cols-3 rounded-xl border border-ink-3 bg-ink-2 p-1">
            {PERIODS.map((p) => (
              <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}
                className={`min-h-10 rounded-lg text-sm ${period === p.id ? "bg-accent font-bold text-ink" : "text-on-ink-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["Check in", data?.summary.checkin, "text-accent"], ["Check out", data?.summary.checkout, ""], ["Insiden", data?.summary.incident, "text-danger-soft"]].map(([k, v, c]) => (
              <div key={k as string} className="flex flex-col">
                <span className={`font-display text-2xl font-bold ${c}`}>{v ?? "–"}</span>
                <span className="text-xs text-on-ink-muted">{k}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {error && !data && <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">Riwayat butuh koneksi. Coba lagi saat ada sinyal.</p>}
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted">{g.label}</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {g.items.map((e, i) => {
              const k = KIND[e.kind];
              return (
                <Link key={`${e.transaction_id}-${e.kind}`} href={`/checkout/${e.transaction_id}`}
                  className={`flex min-h-16 items-center gap-3 px-3.5 py-3 active:bg-paper-2 ${i ? "border-t border-line-2" : ""}`}>
                  <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-xl font-mono text-[11px] font-bold ${k.icon}`}>{k.short}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono text-sm font-bold">{e.plate}</span>
                    <span className="text-xs text-muted">
                      {k.label} · {clock(e.at)} · {e.kind === "in" ? (e.slot ? `slot ${e.slot}` : e.post) : e.incident_code ?? duration(e.duration_minutes ?? null, true)}
                    </span>
                  </span>
                  {e.status === "parked" ? <Badge tone="parked">Parkir</Badge>
                    : e.status === "released" ? <Badge tone="released">Selesai</Badge>
                    : <Badge tone="pending">Insiden</Badge>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {data && !data.events.length && <p className="py-10 text-center text-[15px] text-muted">Belum ada pemeriksaan di periode ini.</p>}
    </Screen>
  );
}
