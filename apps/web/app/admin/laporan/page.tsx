"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api/client";
import { useScope } from "@/lib/admin/scope";
import type { Stats } from "@/lib/admin/types";
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
  const qs = new URLSearchParams({ scope, from, to }).toString();
  const { data: tx, error } = useSWR<{ counts: Record<string, number> }>(
    `/admin/transactions?scope=${encodeURIComponent(scope)}&limit=1`, fetcher);
  const { data: stats } = useSWR<Stats>(`/admin/stats?scope=${encodeURIComponent(scope)}`, fetcher);
  const invalid = from > to;

  const downloads = [
    { href: `${BASE}/admin/reports/transactions.csv?${qs}`, label: "Transaksi (CSV)", sub: "Semua check in dalam periode: tiket cek list, plat, petugas, durasi, status." },
    { href: `${BASE}/admin/reports/incidents.csv?${qs}`, label: "Insiden (CSV)", sub: "Insiden, bagian, catatan petugas, keputusan supervisor." },
    { href: `${BASE}/admin/reports/summary.pdf?${qs}`, label: "Rekap (PDF)", sub: "Ringkasan per lokasi/pos, rata-rata durasi, daftar insiden." },
  ];

  return (
    <>
      <PageHead title="Laporan" sub="Rekap transaksi, durasi parkir, dan insiden.">
        <ScopePicker />
      </PageHead>
      {error && <ErrorNote>{error.message}</ErrorNote>}
      <section className={`${card} flex flex-col gap-4 p-5`}>
        <h2 className={h2}>Periode</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Dari
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputSm} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Sampai
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputSm} />
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
                ["Ada insiden (belum selesai)", tx?.counts.incident],
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
