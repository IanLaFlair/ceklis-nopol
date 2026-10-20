"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { PendingPill, Screen } from "@/components/petugas/shell";
import { useSession } from "@/components/petugas/session";
import { VehicleRow } from "@/components/petugas/vehicle-row";
import { ChevronDown, Exit, Plus, Search } from "@/components/icons";
import { fetcher } from "@/lib/api/client";
import { initial, normalizePlate } from "@/lib/format";
import { cacheGet, cachePut } from "@/lib/offline/db";
import { useActiveList, warmDetails } from "@/lib/petugas/data";

interface PostStats {
  parked: number;
  in_today: number;
  out_today: number;
}

export default function Beranda() {
  const { user, assignment, switchPost } = useSession();
  const active = assignment.active!;
  const { items, offline } = useActiveList(active.post.id);
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState(false);

  const statsKey = `/posts/${active.post.id}/stats`;
  const { data: live } = useSWR<PostStats>(statsKey, fetcher, { refreshInterval: 30_000 });
  const [stats, setStats] = useState<PostStats | undefined>();
  useEffect(() => {
    if (live) {
      setStats(live);
      void cachePut(statsKey, live);
    } else void cacheGet<PostStats>(statsKey).then((c) => c && setStats(c));
  }, [live, statsKey]);

  useEffect(() => {
    if (!offline && items.length) void warmDetails(items);
  }, [offline, items]);

  const norm = normalizePlate(q);
  const list = norm ? items.filter((v) => normalizePlate(v.plate).includes(norm) || normalizePlate(v.slot ?? "").includes(norm)) : items;

  return (
    <Screen
      header={
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-on-ink-muted">{active.site.name}</span>
              <button onClick={() => assignment.assignments.length > 1 && setPicker(true)}
                aria-haspopup={assignment.assignments.length > 1 ? "dialog" : undefined}
                className="inline-flex items-center gap-1.5 text-left font-display text-2xl font-bold tracking-[-0.02em]">
                {active.post.name}
                {assignment.assignments.length > 1 && <ChevronDown size={18} />}
              </button>
              <span className="text-[13px] text-on-ink-muted">{active.shift ?? "Penugasan aktif"}</span>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Link href="/akun" aria-label={`Akun ${user.name}`}
                className="flex size-11 items-center justify-center rounded-full bg-ink-3 font-semibold">
                {initial(user.name)}
              </Link>
              <PendingPill />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Masih parkir", stats?.parked ?? items.length, true],
              ["Masuk hari ini", stats?.in_today ?? "–", false],
              ["Keluar", stats?.out_today ?? "–", false],
            ].map(([label, value, hi]) => (
              <div key={label as string} className="flex flex-col gap-0.5 rounded-xl border border-ink-3 bg-ink-2 p-3">
                <span className={`font-display text-[26px] font-bold ${hi ? "text-accent" : ""}`}>{value}</span>
                <span className="text-xs text-on-ink-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Link href="/checkin" className="tap flex min-h-[120px] flex-col justify-between rounded-[18px] bg-accent p-4 text-ink">
          <Plus size={30} />
          <span className="flex flex-col">
            <strong className="font-display text-[22px]">Check In</strong>
            <span className="text-[13px]">Kendaraan datang</span>
          </span>
        </Link>
        <Link href="/aktif" className="tap flex min-h-[120px] flex-col justify-between rounded-[18px] bg-ink p-4 text-on-ink">
          <Exit size={30} />
          <span className="flex flex-col">
            <strong className="font-display text-[22px]">Check Out</strong>
            <span className="text-[13px] text-[#B4B8B3]">Kendaraan diminta</span>
          </span>
        </Link>
      </div>

      <label className="flex min-h-[52px] items-center gap-2.5 rounded-xl border-[1.5px] border-field bg-surface px-3.5">
        <Search size={18} className="text-muted" />
        <span className="sr-only">Cari plat</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari plat nomor"
          className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      {offline && (
        <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
          Sinyal tidak ada. Menampilkan data terakhir; check in tetap bisa, data dikirim otomatis.
        </p>
      )}

      <section aria-label="Kendaraan aktif" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Masih parkir</h2>
          <span className="text-[13px] text-muted">{list.length} kendaraan</span>
        </div>
        {list.map((v) => <VehicleRow key={v.client_id} v={v} />)}
        {!list.length && <p className="py-8 text-center text-[15px] text-muted">{q ? "Tidak ada kendaraan yang cocok." : "Belum ada kendaraan parkir."}</p>}
      </section>

      {picker && (
        <div role="dialog" aria-modal="true" aria-label="Pilih pos" className="fixed inset-0 z-40 flex items-end bg-ink/50" onClick={() => setPicker(false)}>
          <div className="safe-bottom mx-auto w-full max-w-[480px] rounded-t-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 font-display text-lg font-bold">Pos tugas</h2>
            <p className="mb-3 text-[13px] text-muted">Hanya pos yang ditugaskan admin untuk kamu.</p>
            {assignment.assignments.map((a) => (
              <button key={a.id} onClick={() => { setPicker(false); void switchPost(a.post.id); }}
                className={`flex min-h-14 w-full flex-col justify-center border-t border-line-2 px-1 text-left first:border-0 ${a.post.id === active.post.id ? "font-semibold" : ""}`}>
                <span>{a.site.name} · {a.post.name}</span>
                <span className="text-xs text-muted">{a.shift ?? "—"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}
