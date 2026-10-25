"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api/client";
import { ACTION_LABEL, INCIDENT_STATUS } from "@/lib/admin/actions";
import type { ActivityEntry } from "@/lib/admin/types";
import { SIDE_LABEL, clock, dateTime, duration } from "@/lib/format";
import type { TxDetail, TxPhoto } from "@/lib/types";
import { Badge, ErrorNote, Spinner, StatusBadge } from "../ui";
import { PhotoBox } from "./photo";
import { card, h2 } from "./shell";

const SIDES = ["depan", "belakang", "kiri", "kanan"] as const;

export function sidePhoto(tx: TxDetail, phase: "in" | "out", side: string): TxPhoto | undefined {
  // Foto terakhir untuk sisi itu (ulang foto menggantikan)
  return [...tx.photos].reverse().find((p) => p.phase === phase && p.side === side && !p.incident_id);
}

export function TxDetailView({ id }: { id: number }) {
  const { data: tx, error } = useSWR<TxDetail>(`/transactions/${id}`, fetcher, { refreshInterval: 15000 });
  const { data: log } = useSWR<ActivityEntry[]>(`/admin/transactions/${id}/activity`, fetcher, { refreshInterval: 15000 });

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!tx) return <div className="flex justify-center p-10 text-muted"><Spinner /></div>;

  const inChecks = tx.checks.filter((c) => c.phase === "in");
  const condLabel = (id?: string | null) => tx.template.conditions?.find((o) => o.id === id)?.label;
  const outChecks = new Map(tx.checks.filter((c) => c.phase === "out").map((c) => [c.item_id, c]));
  const insideIn = tx.inside_items.filter((i) => i.phase === "in" && i.present);
  const insideOut = new Map(tx.inside_items.filter((i) => i.phase === "out").map((i) => [i.item_id, i]));
  const details = tx.photos.filter((p) => p.side === "detail");
  const hasSidePhotos = tx.photos.some((p) => p.side !== "detail");
  const car = [tx.make_model, tx.color].filter(Boolean).join(" · ") || tx.vehicle_type;
  // Data lama (alur 4 sisi) masih punya slot/kunci/jenis; alur ringkas tidak
  const meta = [tx.site.name, tx.post.name, tx.slot && `slot ${tx.slot}`, tx.key_tag && `kunci ${tx.key_tag}`].filter(Boolean).join(" · ");
  const photoLabel = (p: TxPhoto) =>
    (p.item_id && (inChecks.find((c) => c.item_id === p.item_id)?.label ?? tx.inside_items.find((i) => i.item_id === p.item_id)?.label)) ||
    (p.incident_id ? "insiden" : "close-up");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-ink p-5 text-on-ink">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="rounded border-2 border-accent bg-plate px-3 py-1 font-mono text-xl font-bold text-ink whitespace-nowrap">{tx.plate}</span>
          <span className="flex min-w-0 flex-col">
            {car && <strong className="text-base">{car}</strong>}
            <span className="text-[13px] text-on-ink-muted">{meta}</span>
          </span>
        </div>
        <StatusBadge status={tx.status} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        <Info label="Masuk" value={dateTime(tx.checkin_at)} sub={`oleh ${tx.checkin_by?.name ?? "-"}`} />
        <Info label="Keluar" value={tx.checkout_at ? dateTime(tx.checkout_at) : "—"} sub={tx.checkout_by ? `oleh ${tx.checkout_by.name}` : "belum keluar"} />
        <Info label="Durasi" value={duration(tx.duration_minutes)} sub={tx.released_at ? "selesai" : "masih parkir"} />
        <Info label="Barang di dalam" value={insideIn.length ? insideIn.map((i) => (i.extra_text ? `${i.label} (${i.extra_text})` : i.label)).join(", ") : "Tidak ada"}
          sub={insideOut.size ? (insideIn.every((i) => insideOut.get(i.item_id)?.present) ? "dikonfirmasi saat keluar" : "ada yang tidak dikonfirmasi") : undefined} />
      </div>

      {(hasSidePhotos || details.length > 0) && (
        <section className={`${card} flex flex-col gap-3 p-[18px]`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>Foto</h2>
            {!tx.photos_complete && <Badge tone="parked">Ada foto belum terunggah</Badge>}
          </div>
          {hasSidePhotos && (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {SIDES.map((s) => (
                  <div key={s} className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">{SIDE_LABEL[s]}</span>
                    <PhotoBox photo={sidePhoto(tx, "in", s)} label={`${SIDE_LABEL[s]} masuk`} />
                    <PhotoBox photo={sidePhoto(tx, "out", s)} label={`${SIDE_LABEL[s]} keluar`} />
                  </div>
                ))}
              </div>
              <span className="text-xs text-muted">Baris atas: check in · baris bawah: check out</span>
            </>
          )}
          {details.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {details.map((p) => (
                <div key={p.id} className="flex flex-col gap-1">
                  <PhotoBox photo={p} label={photoLabel(p)} />
                  <span className="text-[11px] text-muted">{p.phase === "in" ? "Masuk" : "Keluar"} · {photoLabel(p)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-[#E6E6E0] px-[18px] py-4"><h2 className={h2}>Checklist bagian luar</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.05em] text-muted uppercase">
                <th className="px-[18px] py-2.5 font-medium">Bagian</th>
                <th className="px-3 py-2.5 font-medium">Masuk</th>
                <th className="px-[18px] py-2.5 font-medium">Keluar</th>
              </tr>
            </thead>
            <tbody>
              {inChecks.map((c) => {
                const out = outChecks.get(c.item_id);
                const diff = out ? out.checked !== c.checked : false;
                return (
                  <tr key={c.item_id} className={`border-t border-line-2 ${diff ? "bg-danger-bg" : ""}`}>
                    <td className="px-[18px] py-2.5">
                      {c.label}
                      <span className="block text-xs text-muted">{c.group}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Mark ok={c.checked} label={condLabel(c.condition)} />
                      {c.note && <span className="mt-1 block text-xs text-muted">{c.note}</span>}
                    </td>
                    <td className="px-[18px] py-2.5">
                      {out ? <Mark ok={out.checked} label={condLabel(out.condition)} /> : <span className="text-muted">—</span>}
                      {out?.note && <span className="mt-1 block text-xs text-muted">{out.note}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3.5">
        {(tx.notes || tx.checkout_notes) && (
          <section className={`${card} flex min-w-0 flex-[1_1_280px] flex-col gap-2 p-[18px]`}>
            <h2 className={h2}>Catatan</h2>
            {tx.notes && <p className="text-sm"><strong>Masuk:</strong> {tx.notes}</p>}
            {tx.checkout_notes && <p className="text-sm"><strong>Keluar:</strong> {tx.checkout_notes}</p>}
          </section>
        )}
        <section className={`${card} flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 p-[18px]`}>
          <h2 className={h2}>Riwayat</h2>
          {tx.incidents.map((i) => (
            <div key={i.id} className="rounded-xl bg-danger-bg p-3 text-sm text-danger-ink">
              <strong className="font-mono">{i.code}</strong> · {INCIDENT_STATUS[i.status]} — {i.parts.join(", ") || "-"}
              {i.note && <span className="block text-ink">{i.note}</span>}
              {i.decision_note && <span className="block text-ink">Pemeriksaan: {i.decision_note}</span>}
            </div>
          ))}
          {log?.map((a, n) => (
            <div key={n} className="flex gap-2.5 text-sm">
              <span className="w-[46px] shrink-0 font-mono text-muted">{clock(a.at)}</span>
              <span>
                {ACTION_LABEL[a.action] ?? a.action}
                {a.actor ? ` · ${a.actor}` : ""}
                {a.meta && typeof a.meta.code === "string" ? ` · ${a.meta.code}` : ""}
              </span>
            </div>
          ))}
          {log && !log.length && !tx.incidents.length && <p className="text-sm text-muted">Belum ada riwayat.</p>}
        </section>
      </div>
    </div>
  );
}

function Mark({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <span className="inline-flex rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success">{label ?? "Baik"}</span>
  ) : (
    <span className="inline-flex rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger-ink">{label ?? "Perlu dicek"}</span>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${card} flex min-w-0 flex-col gap-0.5 rounded-xl p-3.5`}>
      <span className="text-xs text-muted">{label}</span>
      <strong className="break-words">{value}</strong>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}
