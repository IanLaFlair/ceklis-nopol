"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api/client";
import { useQueryParam, useScope } from "@/lib/admin/scope";
import { clock, dateTime } from "@/lib/format";
import type { TxListItem } from "@/lib/types";
import { PageHead, card } from "@/components/admin/shell";
import { ScopePicker } from "@/components/admin/scope-picker";
import { TxDetailView } from "@/components/admin/tx-detail";
import { Search } from "@/components/icons";
import { ErrorNote, Plate, StatusBadge } from "@/components/ui";

const TABS = [
  { id: "all", label: "Semua" },
  { id: "parked", label: "Masih parkir" },
  { id: "done", label: "Selesai" },
  { id: "incident", label: "Ada insiden" },
] as const;

interface ListRes {
  counts: Record<string, number>;
  items: TxListItem[];
}

export default function TransaksiPage() {
  const [scope] = useScope();
  const [tab, setTab] = useQueryParam("tab");
  const [idParam, setId] = useQueryParam("id");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const t = tab ?? "all";
  const qs = new URLSearchParams({ scope, tab: t, limit: "100" });
  if (debounced) qs.set("q", debounced);
  const { data, error } = useSWR<ListRes>(`/admin/transactions?${qs}`, fetcher, { refreshInterval: 15000 });
  const id = idParam ? Number(idParam) : data?.items[0]?.id;

  return (
    <>
      <PageHead title="Transaksi" sub="Kendaraan masuk, keluar, dan data kendaraan">
        <ScopePicker />
        <label className="flex min-h-[46px] w-full items-center gap-2 rounded-xl border-[1.5px] border-field bg-surface px-3 sm:w-[300px]">
          <Search size={18} />
          <span className="sr-only">Cari</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari plat nomor"
            className="min-w-0 flex-1 border-0 bg-transparent text-base outline-none sm:text-sm" />
        </label>
      </PageHead>

      <div className="flex flex-wrap items-start gap-4">
        {/* Filter ikut kolom kiri supaya kartu detail di kanan sejajar dengan bagian atas filter */}
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-2">
            {TABS.map((x) => (
              <button key={x.id} role="tab" aria-selected={t === x.id} onClick={() => { setTab(x.id === "all" ? null : x.id); }}
                className={`tap min-h-11 rounded-full border-[1.5px] px-4 text-sm ${t === x.id ? "border-ink bg-ink font-semibold text-on-ink" : "border-field bg-surface"}`}>
                {x.label} <span className="opacity-70">{data?.counts[x.id] ?? ""}</span>
              </button>
            ))}
          </div>
          {error && <ErrorNote>{error.message}</ErrorNote>}
          <section aria-label="Daftar transaksi" className={`${card} min-w-0 overflow-hidden`}>
            {data?.items.map((r, i) => (
              <button key={r.id} onClick={() => setId(String(r.id))} aria-current={r.id === id ? "true" : undefined}
                className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-2 ${i ? "border-t border-line-2" : ""} ${r.id === id ? "bg-warning-bg shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                <Plate size="sm">{r.plate}</Plate>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{[r.make_model, r.color].filter(Boolean).join(" · ") || `oleh ${r.checkin_by?.name ?? "-"}${r.checkout_by ? ` · keluar oleh ${r.checkout_by.name}` : ""}`}</span>
                  <span className="truncate text-xs text-muted">
                    {r.site.name} · {r.post.name} · {r.checkout_at ? `${clock(r.checkin_at)}–${clock(r.checkout_at)}` : dateTime(r.checkin_at)}
                  </span>
                </span>
                <StatusBadge status={r.status} />
              </button>
            ))}
            {data && !data.items.length && <p className="p-8 text-center text-sm text-muted">Tidak ada transaksi yang cocok.</p>}
          </section>
        </div>
        <section aria-label="Detail transaksi" className="min-w-0 flex-[1.5_1_560px]">
          {id ? <TxDetailView id={id} /> : <p className="p-8 text-center text-muted">Pilih transaksi untuk melihat detail.</p>}
        </section>
      </div>
    </>
  );
}
