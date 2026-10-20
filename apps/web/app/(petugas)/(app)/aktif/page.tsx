"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQrCheckout } from "@/components/petugas/finder";
import { Screen } from "@/components/petugas/shell";
import { useSession } from "@/components/petugas/session";
import { carLine } from "@/components/petugas/vehicle-row";
import { ArrowRight, Scan, Search } from "@/components/icons";
import { Badge, chip, ErrorNote, Plate } from "@/components/ui";
import { clock, duration, minutesSince, normalizePlate } from "@/lib/format";
import { useActiveList, warmDetails, type ActiveItem } from "@/lib/petugas/data";

const FILTERS = [
  { id: "all", label: "Semua", test: () => true },
  { id: "long", label: "Lebih dari 3 jam", test: (v: ActiveItem) => minutesSince(v.checkin_at) > 180 },
  { id: "note", label: "Ada catatan", test: (v: ActiveItem) => !!v.notes || v.has_issue || v.status !== "parked" },
  { id: "vip", label: "VIP", test: (v: ActiveItem) => v.vip },
] as const;

export default function AktifPage() {
  const { assignment } = useSession();
  const active = assignment.active!;
  const { items, offline } = useActiveList(active.post.id);
  const qr = useQrCheckout(items);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!offline && items.length) void warmDetails(items);
  }, [offline, items]);

  const norm = normalizePlate(q);
  const test = FILTERS.find((f) => f.id === filter)!.test;
  const list = items.filter(
    (v) => test(v) && (!norm || normalizePlate(v.plate).includes(norm) || normalizePlate(v.slot ?? "").includes(norm)),
  );

  return (
    <Screen
      header={
        <div className="flex flex-col gap-3.5">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-on-ink-muted">{active.site.name} · {active.post.name}</span>
              <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">Masih parkir</h1>
            </div>
            <span className="font-display text-3xl font-bold text-accent">{items.length}</span>
          </div>
          <div className="flex gap-2">
            <label className="flex min-h-[50px] flex-1 items-center gap-2.5 rounded-xl border border-ink-3 bg-ink-2 px-3.5">
              <Search size={18} className="text-on-ink-muted" />
              <span className="sr-only">Cari plat atau slot</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari plat atau slot"
                className="min-w-0 flex-1 bg-transparent text-on-ink outline-none placeholder:text-on-ink-muted" />
            </label>
            <button onClick={qr.open} aria-label="Scan QR tiket cek list" className="flex size-[50px] items-center justify-center rounded-xl bg-accent text-ink">
              <Scan size={22} />
            </button>
          </div>
        </div>
      }
    >
      <div role="group" aria-label="Filter" className="-mx-5 -mt-1 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`${chip(filter === f.id)} shrink-0 whitespace-nowrap`}>
            {f.label}
          </button>
        ))}
      </div>
      <ErrorNote>{qr.error}</ErrorNote>
      {offline && <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">Offline — menampilkan data terakhir yang tersimpan.</p>}

      {list.map((v) => {
        const mins = minutesSince(v.checkin_at);
        return (
          <div key={v.client_id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-3">
              <Plate size="md">{v.plate}</Plate>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{carLine(v)}</span>
              <span className={`shrink-0 rounded-full px-2 py-[3px] text-xs font-semibold ${mins > 180 ? "bg-danger-bg text-danger-ink" : "bg-paper-2 text-muted"}`}>
                {duration(mins, true)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[["Slot", v.slot ?? "-", true], ["Kunci", v.key_tag ?? "-", true], ["Masuk", clock(v.checkin_at), false]].map(([k, val, mono]) => (
                <span key={k as string} className="flex flex-col">
                  <span className="text-muted">{k}</span>
                  <strong className={`text-sm ${mono ? "font-mono" : ""}`}>{val}</strong>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {v.vip && <Badge tone="parked">VIP</Badge>}
              {v.local && <Badge tone="local">Belum terkirim</Badge>}
              {v.status !== "parked" && <Badge tone="pending">{v.status === "incident_pending" ? "Menunggu supervisor" : "Kerusakan dicatat"}</Badge>}
            </div>
            {(v.notes || v.has_issue) && (
              <span className="rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs text-[#7A2F06]">
                {v.notes || "Ada bagian yang perlu dicek saat masuk"}
              </span>
            )}
            <Link href={`/checkout/${v.client_id}`} className="tap flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-on-ink">
              {v.status === "parked" ? "Check Out" : "Lihat status"}<ArrowRight size={16} stroke={2.2} />
            </Link>
          </div>
        );
      })}
      {!list.length && <p className="py-10 text-center text-[15px] text-muted">Tidak ada kendaraan yang cocok.</p>}
      {qr.scanner}
    </Screen>
  );
}
