"use client";

import { INCIDENTS_ENABLED } from "@/lib/features";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api/client";
import { useScope } from "@/lib/admin/scope";
import type { AdminUserRow, Stats } from "@/lib/admin/types";
import { duration } from "@/lib/format";
import { PageHead, btnSm, card, h2, inputSm } from "@/components/admin/shell";
import { ScopePicker } from "@/components/admin/scope-picker";
import { ErrorNote } from "@/components/ui";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

function iso(d: Date) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export default function LaporanPage() {
  const [scope] = useScope();
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 6 * 86400000)));
  const [to, setTo] = useState(iso(today));
  const [userId, setUserId] = useState("");
  const { data: users } = useSWR<AdminUserRow[]>("/admin/users", fetcher);
  const staff = (users ?? []).filter((u) => u.role === "petugas" || u.role === "supervisor");
  const qs = new URLSearchParams({ scope, from, to, ...(userId ? { user: userId } : {}) }).toString();
  const { data: tx, error } = useSWR<{ counts: Record<string, number> }>(
    `/admin/transactions?scope=${encodeURIComponent(scope)}&limit=1`, fetcher);
  const { data: stats } = useSWR<Stats>(`/admin/stats?scope=${encodeURIComponent(scope)}`, fetcher);
  const invalid = from > to;

  const downloads = [
    { href: `${BASE}/admin/reports/transactions.xlsx?${qs}`, label: "Transaksi (Excel)", sub: "Semua check in dalam periode: plat, lokasi, petugas masuk/keluar, durasi, status, kondisi, barang. Plus sheet rekap per pos dan per petugas." },
    ...(INCIDENTS_ENABLED
      ? [{ href: `${BASE}/admin/reports/incidents.csv?${qs}`, label: "Insiden (CSV)", sub: "Insiden, bagian, catatan petugas, keputusan supervisor." }]
      : []),
    { href: `${BASE}/admin/reports/summary.pdf?${qs}`, label: "Laporan (PDF)", sub: "Ringkasan, rekap per pos & per petugas, dan rincian setiap transaksi dalam periode." },
    { href: `${BASE}/admin/reports/daily.pdf?${qs}`, label: "Laporan Harian (PDF)", sub: "Transaksi dikelompokkan per hari, lengkap dengan foto kecil tiap kendaraan." },
  ];

  return (
    <>
      <PageHead title="Laporan" sub="Rekap transaksi dan durasi parkir.">
        <ScopePicker />
      </PageHead>
      {error && <ErrorNote>{error.message}</ErrorNote>}
      <section className={`${card} flex flex-col gap-4 p-5`}>
        <h2 className={h2}>Periode & petugas</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Dari
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputSm} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Sampai
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputSm} />
          </label>
          <label className="flex min-w-[220px] flex-col gap-1.5 text-sm font-semibold">Petugas
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputSm}>
              <option value="">Semua petugas</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.staff_code ? ` · ${u.staff_code}` : ""}{u.active ? "" : " (nonaktif)"}</option>
              ))}
            </select>
          </label>
        </div>
        {invalid && <ErrorNote>Tanggal awal setelah tanggal akhir.</ErrorNote>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {downloads.map((d) => (
            <a key={d.label} href={invalid ? undefined : d.href} download aria-disabled={invalid}
              className={`flex flex-col gap-1.5 rounded-xl border-[1.5px] border-ink p-4 hover:bg-paper-2 ${invalid ? "pointer-events-none opacity-50" : ""}`}>
              <strong className="font-display text-base">{d.label}</strong>
              <span className="text-sm text-muted">{d.sub}</span>
              <span className={`${btnSm} mt-1 self-start bg-ink text-on-ink`}>Unduh</span>
            </a>
          ))}
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-[#E6E6E0] px-5 py-4"><h2 className={h2}>Rekap saat ini</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <tbody>
              {[
                ["Semua transaksi tercatat", tx?.counts.all],
                ["Masih parkir", tx?.counts.parked],
                ["Selesai", tx?.counts.done],
                ...(INCIDENTS_ENABLED ? [["Ada insiden (belum selesai)", tx?.counts.incident] as const] : []),
                ["Masuk hari ini", stats?.kpi.in_today],
                ["Keluar hari ini", stats?.kpi.out_today],
                ["Rata-rata durasi hari ini", stats ? duration(stats.kpi.avg_duration_minutes) : undefined],
              ].map(([k, v]) => (
                <tr key={String(k)} className="border-t border-line-2 first:border-t-0">
                  <td className="px-5 py-3 text-muted">{k}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold">{v ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
