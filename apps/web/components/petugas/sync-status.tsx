"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { db } from "@/lib/offline/db";
import { useLiveQuery, useOnline } from "@/lib/offline/hooks";
import { syncNow } from "@/lib/offline/sync";
import { Check, CloudOff } from "../icons";
import { Spinner } from "../ui";
import { useSession } from "./session";

/** Tombol "Kirim sekarang": paksa sinkron, beri tahu kalau masih tanpa sinyal. */
function useSendNow() {
  const router = useRouter();
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setNote(null);
    const r = await syncNow(user.id).catch(() => null);
    setBusy(false);
    if (r?.stoppedBy === "auth") router.replace("/masuk?sesi=habis");
    else if (!r || r.stoppedBy === "offline") setNote("Belum tersambung. Cari sinyal lalu coba lagi.");
  }
  return { busy, note, send };
}

/** Status kirim satu check in di layar "Check in berhasil": data + foto transaksi ini. */
export function TxSyncStatus({ txClientId, photoCount }: { txClientId: string; photoCount: number }) {
  const online = useOnline();
  const { busy, note, send } = useSendNow();
  const left = useLiveQuery(
    async () => ({
      data: await db.outbox.where("tx_client_id").equals(txClientId).count(),
      photos: await db.photos.where("tx_client_id").equals(txClientId).count(),
    }),
    [txClientId],
    { data: 1, photos: photoCount },
  );

  if (!left.data && !left.photos) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-success-bg px-3.5 py-2.5 text-[13px] font-semibold text-success">
        <Check size={16} stroke={2.6} />
        {photoCount ? `Data & ${photoCount} foto terkirim ke server.` : "Data terkirim ke server."}
      </p>
    );
  }
  const what = left.data ? "Data check in" : `${left.photos} dari ${photoCount} foto`;
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-warning-bg px-3.5 py-3 text-left text-[13px] text-warning">
      <span className="flex items-center gap-2 font-semibold">
        {online ? <Spinner /> : <CloudOff size={16} />}
        {online ? `Mengirim… ${what} belum terkirim` : `Tanpa sinyal: ${what} belum terkirim`}
      </span>
      <span>Tersimpan aman di HP dan dikirim otomatis selama aplikasi terbuka. Boleh lanjut kerja.</span>
      <button onClick={send} disabled={busy} className="flex min-h-10 items-center justify-center gap-2 self-start rounded-lg bg-ink px-3.5 font-semibold text-on-ink disabled:opacity-60">
        {busy && <Spinner />}Kirim sekarang
      </button>
      {note && <span className="font-semibold">{note}</span>}
    </div>
  );
}

/** Pengingat di Beranda kalau masih ada data/foto di HP yang belum terkirim (yang ditolak server ditangani RejectedNotice). */
export function PendingNotice() {
  const { pending } = useSession();
  const online = useOnline();
  const { busy, note, send } = useSendNow();
  const data = pending.data - pending.errors.length;
  if (data <= 0 && pending.photos <= 0) return null;
  const parts = [data > 0 && `${data} data`, pending.photos > 0 && `${pending.photos} foto`].filter(Boolean).join(" & ");
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#E8D68A] bg-warning-bg px-3.5 py-3 text-sm text-warning">
      <span className="flex items-center gap-2 font-semibold">
        {online ? <Spinner /> : <CloudOff size={16} />}
        {parts} belum terkirim
      </span>
      <span className="text-[13px]">
        {online ? "Sedang dikirim otomatis. Biarkan aplikasi terbuka sebentar." : "Tidak ada sinyal. Dikirim otomatis begitu tersambung."}
      </span>
      <button onClick={send} disabled={busy} className="flex min-h-10 items-center justify-center gap-2 self-start rounded-lg bg-ink px-3.5 font-semibold text-on-ink disabled:opacity-60">
        {busy && <Spinner />}Kirim sekarang
      </button>
      {note && <span className="text-[13px] font-semibold">{note}</span>}
    </section>
  );
}
