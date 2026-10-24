"use client";

import { useState } from "react";
import { discardOutbox } from "@/lib/offline/queue";
import { Info } from "../icons";
import { useSession } from "./session";

/** Muncul hanya kalau ada data yang ditolak server. Data tetap tersimpan di HP sampai petugas menghapusnya. */
export function RejectedNotice() {
  const { pending } = useSession();
  const [open, setOpen] = useState(false);
  const errors = pending.errors;
  if (!errors.length) return null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger-bg px-3.5 py-3 text-sm text-danger-ink">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-10 items-center gap-2.5 text-left">
        <Info size={18} className="shrink-0" />
        <strong className="flex-1">{errors.length} data ditolak server</strong>
        <span className="text-xs underline">{open ? "Tutup" : "Lihat"}</span>
      </button>
      {open && (
        <>
          {errors.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-ink">
              <span>
                <strong>{e.kind === "checkin" ? "Check in" : "Check out"}</strong>
                {(e.body as { plate?: string })?.plate ? ` ${(e.body as { plate?: string }).plate}` : ""}: {e.last_error}
              </span>
              <button
                onClick={() => window.confirm("Hapus data ini dari HP? Tidak bisa dibatalkan.") && discardOutbox(e.id!)}
                className="min-h-10 self-start rounded-lg border border-danger px-3 text-[13px] font-semibold text-danger-ink">
                Hapus data ini
              </button>
            </div>
          ))}
          <span className="text-xs">Data masih tersimpan di HP. Hubungi supervisor kalau tidak yakin.</span>
        </>
      )}
    </section>
  );
}
