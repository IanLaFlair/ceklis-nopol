"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, ApiError, fetcher } from "@/lib/api/client";
import { ACTION_LABEL, INCIDENT_STATUS } from "@/lib/admin/actions";
import { useQueryParam, useScope } from "@/lib/admin/scope";
import type { ActivityEntry, AdminIncident } from "@/lib/admin/types";
import { SIDE_LABEL, clock, dateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/types";
import { PageHead, card, h2 } from "@/components/admin/shell";
import { ScopePicker } from "@/components/admin/scope-picker";
import { PhotoBox } from "@/components/admin/photo";
import { sidePhoto } from "@/components/admin/tx-detail";
import { Badge, ErrorNote, Plate, Spinner, StatusBadge } from "@/components/ui";

const FILTERS = [
  { id: "all", label: "Semua" },
  { id: "pending", label: "Menunggu" },
  { id: "confirmed", label: "Kerusakan baru" },
  { id: "dismissed", label: "Tidak ada kerusakan" },
];

export default function InsidenPage() {
  const [scope] = useScope();
  const [status, setStatus] = useQueryParam("status");
  const [idParam, setId] = useQueryParam("id");
  const s = status ?? "all";
  const { data, error } = useSWR<{ pending: number; items: AdminIncident[] }>(
    `/admin/incidents?scope=${encodeURIComponent(scope)}&status=${s}`, fetcher, { refreshInterval: 15000 });
  const id = idParam ? Number(idParam) : data?.items[0]?.id;

  return (
    <>
      <PageHead title="Insiden / Komplain" sub="Perbedaan kondisi yang perlu diperiksa supervisor sebelum kendaraan diserahkan.">
        <ScopePicker />
      </PageHead>
      <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={s === f.id} onClick={() => { setStatus(f.id === "all" ? null : f.id); }}
            className={`tap min-h-11 rounded-full border-[1.5px] px-4 text-sm ${s === f.id ? "border-ink bg-ink font-semibold text-on-ink" : "border-field bg-surface"}`}>
            {f.label}{f.id === "pending" && data ? <span className="opacity-70"> {data.pending}</span> : null}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error.message}</ErrorNote>}
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Daftar insiden" className={`${card} min-w-0 flex-[1_1_340px] overflow-hidden`}>
          {data?.items.map((r, i) => (
            <button key={r.id} onClick={() => setId(String(r.id))} aria-current={r.id === id ? "true" : undefined}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-paper-2 ${i ? "border-t border-line-2" : ""} ${r.id === id ? "bg-warning-bg shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <strong className="font-mono text-[13px]">{r.code}</strong>
                  <span className="font-mono text-[13px] font-bold">{r.plate}</span>
                </span>
                <span className="truncate text-sm">{r.parts.join(", ") || r.note || "-"}</span>
                <span className="text-xs text-muted">{r.site} · {r.post} · {dateTime(r.created_at)}</span>
              </span>
              <Badge tone={r.status}>{INCIDENT_STATUS[r.status]}</Badge>
            </button>
          ))}
          {data && !data.items.length && <p className="p-8 text-center text-sm text-muted">Tidak ada insiden.</p>}
        </section>
        <section aria-label="Detail insiden" className="min-w-0 flex-[1.6_1_560px]">
          {id ? <IncidentView id={id} keep={() => setId(String(id))} /> : <p className="p-8 text-center text-muted">Pilih insiden untuk melihat detail.</p>}
        </section>
      </div>
    </>
  );
}

const SIDES = ["kiri", "kanan", "depan", "belakang"] as const;

function guessSide(parts: string[]): (typeof SIDES)[number] {
  const t = parts.join(" ").toLowerCase();
  if (t.includes("kiri")) return "kiri";
  if (t.includes("kanan")) return "kanan";
  if (t.includes("belakang") || t.includes("bagasi")) return "belakang";
  return "depan";
}

function IncidentView({ id, keep }: { id: number; keep: () => void }) {
  const { mutate } = useSWRConfig();
  const key = `/incidents/${id}`;
  const { data: inc, error } = useSWR<IncidentDetail>(key, fetcher, { refreshInterval: 15000 });
  const { data: log } = useSWR<ActivityEntry[]>(inc ? `/admin/transactions/${inc.transaction.id}/activity` : null, fetcher);
  const [side, setSide] = useState<(typeof SIDES)[number] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!inc) return <div className="flex justify-center p-10 text-muted"><Spinner /></div>;
  const tx = inc.transaction;
  const cur = side ?? guessSide(inc.parts);
  const closeups = tx.photos.filter((p) => p.incident_id === inc.id);
  const outPhoto = sidePhoto(tx, "out", cur);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      await api(path, { method: "POST", json: body });
      // Tetap di insiden ini walau sudah keluar dari filter "Menunggu"
      keep();
      await mutate(key);
      await mutate((k) => typeof k === "string" && k.startsWith("/admin/incidents"));
      setNote("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3.5 p-5`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] text-muted">{inc.code} · {tx.site.name} · {tx.post.name} · Tiket cek list {tx.ticket_code}</span>
          <span className="flex flex-wrap items-center gap-3">
            <Plate size="lg">{tx.plate}</Plate>
            <strong className="text-base">{inc.parts.join(", ") || "Bagian tidak disebut"}</strong>
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={inc.status}>{INCIDENT_STATUS[inc.status]}</Badge>
          <StatusBadge status={tx.status} />
        </div>
      </div>

      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>Bandingkan · sisi {SIDE_LABEL[cur].toLowerCase()}</h2>
          <div role="tablist" aria-label="Sisi kendaraan" className="flex gap-1.5">
            {SIDES.map((s) => (
              <button key={s} role="tab" aria-selected={cur === s} onClick={() => setSide(s)}
                className={`min-h-11 rounded-[10px] border-[1.5px] px-3 text-sm ${cur === s ? "border-ink bg-ink font-semibold text-on-ink" : "border-field bg-surface"}`}>
                {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <PhotoBox photo={sidePhoto(tx, "in", cur)} label={`${cur} check in`} className="h-[200px]" />
            <span className="text-[13px] text-muted">Check in · {clock(tx.checkin_at)} · {tx.checkin_by?.name}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <PhotoBox photo={outPhoto} label={`${cur} check out`} className="h-[200px]" marker />
            <span className="text-[13px] text-muted">
              Check out · {clock(tx.checkout_at)} · {tx.checkout_by?.name ?? "-"}
              {closeups.length ? ` · + ${closeups.length} foto close-up` : ""}
            </span>
          </div>
        </div>
        {closeups.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {closeups.map((p) => <PhotoBox key={p.id} photo={p} label="close-up insiden" className="h-[110px]" />)}
          </div>
        )}
        <div className="rounded-[10px] bg-paper-2 px-3.5 py-3 text-sm leading-normal">
          <strong>Catatan petugas:</strong> {inc.note || "-"}
        </div>
      </section>

      <div className="flex flex-wrap gap-3.5">
        <section className={`${card} flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 p-[18px]`}>
          <h2 className={h2}>Riwayat</h2>
          {log?.map((a, n) => (
            <div key={n} className="flex gap-2.5 text-sm">
              <span className="w-[46px] shrink-0 font-mono text-muted">{clock(a.at)}</span>
              <span>{ACTION_LABEL[a.action] ?? a.action}{a.actor ? ` · ${a.actor}` : ""}</span>
            </div>
          ))}
          {inc.decision_note && <p className="text-sm"><strong>Catatan pemeriksaan:</strong> {inc.decision_note}</p>}
        </section>
        <section className="flex min-w-0 flex-[1.3_1_320px] flex-col gap-3 rounded-[14px] bg-ink p-[18px] text-on-ink">
          <h2 className={h2}>Keputusan supervisor</h2>
          {inc.status === "pending" ? (
            <>
              <label className="flex flex-col gap-1.5 text-[13px] text-on-ink-muted">
                Catatan pemeriksaan
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. sudah dicek bersama pemilik"
                  className="resize-none rounded-[10px] border border-ink-line bg-ink-2 px-3 py-2.5 text-base text-on-ink outline-none focus:border-accent sm:text-sm" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => act(`/incidents/${inc.id}/decision`, { decision: "damage_confirmed", note })}
                  className="tap min-h-12 flex-[1_1_180px] rounded-[10px] bg-danger text-sm font-bold text-white disabled:opacity-50">
                  Kerusakan baru, catat
                </button>
                <button disabled={busy} onClick={() => act(`/incidents/${inc.id}/decision`, { decision: "no_damage", note })}
                  className="tap min-h-12 flex-[1_1_180px] rounded-[10px] bg-accent text-sm font-bold text-ink disabled:opacity-50">
                  Tidak ada, serahkan
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm">
              {inc.decision === "damage_confirmed" ? "Kerusakan baru dicatat" : "Tidak ada kerusakan baru"} oleh {inc.decided_by?.name ?? "-"} · {dateTime(inc.decided_at)}
            </p>
          )}
          {tx.status === "incident_confirmed" && (
            <button disabled={busy} onClick={() => act(`/transactions/${tx.id}/release`)}
              className="tap min-h-12 rounded-[10px] bg-accent text-sm font-bold text-ink disabled:opacity-50">
              Serahkan kendaraan
            </button>
          )}
          {msg && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-ink">{msg}</p>}
          <span className="text-xs leading-normal text-on-ink-muted">
            Hasil perbandingan adalah bahan pemeriksaan, bukan penetapan siapa yang bertanggung jawab.
          </span>
        </section>
      </div>
    </div>
  );
}
