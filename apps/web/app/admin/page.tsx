"use client";

import { INCIDENTS_ENABLED } from "@/lib/features";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api/client";
import { ACTION_DOT, ACTION_LABEL } from "@/lib/admin/actions";
import { useScope, withScope } from "@/lib/admin/scope";
import type { Stats } from "@/lib/admin/types";
import { clock, duration, longDate } from "@/lib/format";
import { PageHead, btnSm, card, h2 } from "@/components/admin/shell";
import { ScopePicker } from "@/components/admin/scope-picker";
import { ErrorNote } from "@/components/ui";

export default function DashboardPage() {
  const [scope] = useScope();
  const { data, error } = useSWR<Stats>(`/admin/stats?scope=${encodeURIComponent(scope)}`, fetcher, {
    refreshInterval: 15000,
  });
  const k = data?.kpi;

  return (
    <>
      <PageHead title="Dashboard" sub={`Hari ini, ${longDate()} · diperbarui tiap 15 detik`}>
        <ScopePicker />
        <Link href={withScope("/admin/laporan", scope)} className={`${btnSm} bg-ink text-on-ink`}>Export laporan</Link>
      </PageHead>
      {error && <ErrorNote>{error.message}</ErrorNote>}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        <div className="col-span-2 flex flex-col gap-1.5 rounded-[14px] bg-ink p-5 text-on-ink sm:col-span-1">
          <span className="text-[13px] text-on-ink-muted">Masih parkir</span>
          <span className="font-display text-4xl font-bold text-accent">{k?.parked ?? "–"}</span>
          <span className="text-xs text-on-ink-muted">kendaraan di semua pos terpilih</span>
        </div>
        <Kpi label="Masuk hari ini" value={k?.in_today} />
        <Kpi label="Keluar hari ini" value={k?.out_today} />
        {INCIDENTS_ENABLED && <Kpi label="Insiden terbuka" value={k?.open_incidents} danger />}
        <Kpi label="Rata-rata durasi" value={k ? (k.avg_duration_minutes == null ? "–" : duration(k.avg_duration_minutes, true)) : undefined} />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <HourlyChart hourly={data?.hourly} />
        <section aria-label="Aktivitas terbaru" className={`${card} flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[22px]`}>
          <h2 className={h2}>Aktivitas terbaru</h2>
          {data && !data.activity.length && <p className="text-sm text-muted">Belum ada aktivitas.</p>}
          {data?.activity.map((a, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm">
              <span aria-hidden="true" className={`mt-[7px] size-2 shrink-0 rounded-full ${ACTION_DOT[a.action] ?? "bg-muted"}`} />
              <span className="flex flex-1 flex-col gap-0.5">
                <span>
                  <strong className="font-mono">{a.plate ?? a.code ?? "-"}</strong> {ACTION_LABEL[a.action] ?? a.action}
                </span>
                <span className="text-xs text-muted">
                  {a.site} · {a.post} · {clock(a.at)}{a.actor ? ` · ${a.actor}` : ""}
                </span>
              </span>
            </div>
          ))}
          <Link href={withScope("/admin/transaksi", scope)} className="mt-auto text-sm font-semibold underline">
            Lihat semua transaksi
          </Link>
        </section>
      </div>

      <section aria-label="Per lokasi" className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E6E0] px-[22px] py-[18px]">
          <h2 className="font-display text-lg font-bold">Per lokasi</h2>
          <Link href={withScope("/admin/lokasi", scope)} className="text-sm underline">Kelola lokasi</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.05em] text-muted uppercase">
                <th className="px-[22px] py-3 font-medium">Lokasi / pos</th>
                <th className="p-3 text-right font-medium">Masih parkir</th>
                <th className="p-3 text-right font-medium">Masuk</th>
                <th className="p-3 text-right font-medium">Keluar</th>
                {INCIDENTS_ENABLED && <th className="p-3 text-right font-medium">Insiden</th>}
                <th className="px-[22px] py-3 font-medium">Petugas aktif</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-t border-line-2 hover:bg-paper-2">
                  <td className="py-3 pr-3" style={{ paddingLeft: r.kind === "post" ? 46 : 22 }}>
                    <span className={r.kind === "site" ? "font-semibold" : ""}>{r.name}</span>
                  </td>
                  <td className="p-3 text-right font-mono">{r.parked}</td>
                  <td className="p-3 text-right font-mono">{r.in}</td>
                  <td className="p-3 text-right font-mono">{r.out}</td>
                  {INCIDENTS_ENABLED && <td className={`p-3 text-right font-mono ${r.incidents ? "text-danger-ink" : ""}`}>{r.incidents}</td>}
                  <td className="px-[22px] py-3 text-muted">{r.staff.length ? r.staff.join(", ") : "-"}</td>
                </tr>
              ))}
              {data && !data.rows.length && (
                <tr><td colSpan={6} className="px-[22px] py-6 text-center text-muted">Belum ada pos di lingkup ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number | string | undefined; danger?: boolean }) {
  return (
    <div className={`${card} flex flex-col gap-1.5 p-5`}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`font-display text-[32px] font-bold sm:text-4xl ${danger ? "text-danger-ink" : ""}`}>{value ?? "–"}</span>
    </div>
  );
}

function HourlyChart({ hourly }: { hourly?: Stats["hourly"] }) {
  const all = hourly ?? [];
  const active = all.filter((h) => h.in || h.out).map((h) => h.hour);
  const from = Math.min(6, ...active);
  const to = Math.max(22, ...active);
  const hours = all.filter((h) => h.hour >= from && h.hour <= to);
  const max = Math.max(1, ...hours.map((h) => Math.max(h.in, h.out)));
  const top = max <= 10 ? Math.max(max, 5) : Math.ceil(max / 10) * 10;
  const totalIn = hours.reduce((a, h) => a + h.in, 0);
  const totalOut = hours.reduce((a, h) => a + h.out, 0);
  const peak = hours.reduce<Stats["hourly"][number] | null>((p, h) => (!p || h.in > p.in ? h : p), null);

  return (
    <section aria-label="Masuk dan keluar per jam" className={`${card} flex min-w-0 flex-[2_1_560px] flex-col gap-4 p-[22px]`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Masuk &amp; keluar per jam</h2>
        <div className="flex gap-4 text-[13px] text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" />Masuk</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#2B2F2C]" />Keluar</span>
        </div>
      </div>
      <p className="sr-only">
        Hari ini {totalIn} kendaraan masuk dan {totalOut} keluar.
        {peak && peak.in ? ` Puncak masuk pukul ${String(peak.hour).padStart(2, "0")}.00 (${peak.in}).` : ""}
      </p>
      <div aria-hidden="true" className="flex h-[220px] gap-2.5">
        <div className="flex w-7 flex-col justify-between pb-[22px] text-right font-mono text-[11px] text-muted-2">
          <span>{top}</span><span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-1 items-end gap-[3px] border-b border-field sm:gap-2">
            {hours.map((h) => (
              <div key={h.hour} title={`${String(h.hour).padStart(2, "0")}.00 — masuk ${h.in}, keluar ${h.out}`}
                className="flex h-full min-w-0 flex-1 items-end gap-0.5">
                <div className="flex-1 rounded-t bg-accent" style={{ height: `${(h.in / top) * 100}%` }} />
                <div className="flex-1 rounded-t bg-[#2B2F2C]" style={{ height: `${(h.out / top) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-[3px] font-mono text-[10px] text-muted-2 sm:gap-2 sm:text-[11px]">
            {hours.map((h) => (
              <span key={h.hour} className="flex-1 text-center">{h.hour % 2 === 0 ? String(h.hour).padStart(2, "0") : ""}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
