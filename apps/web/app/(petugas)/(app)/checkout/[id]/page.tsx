"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/petugas/session";
import { Check, ChevronLeft, Info } from "@/components/icons";
import { btnDark, btnGhost, btnPrimary, ErrorNote, Plate, Spinner, StatusBadge } from "@/components/ui";
import { clock, duration, minutesSince } from "@/lib/format";
import { enqueueCheckout } from "@/lib/offline/queue";
import { loadTransaction } from "@/lib/petugas/data";
import type { TxDetail } from "@/lib/types";

/** id bisa angka (server) atau UUID dari HP. Dibaca dari URL supaya shell offline tetap bekerja. */
function useTxRef(): string | null {
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    setRef(decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[1] ?? ""));
  }, []);
  return ref;
}

export default function CheckoutPage() {
  const ref = useTxRef();
  const [state, setState] = useState<{ tx: TxDetail; source: string } | null | undefined>(undefined);

  const reload = useCallback(async () => {
    if (ref) setState(await loadTransaction(ref));
  }, [ref]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (state === undefined) return <div aria-busy="true" className="min-h-dvh bg-paper" />;
  if (state === null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-3 p-6">
        <h1 className="font-display text-2xl font-bold">Kendaraan tidak ditemukan</h1>
        <p className="text-muted">Kendaraan ini tidak ada di pos kamu, atau belum tersimpan di HP saat offline.</p>
        <Link href="/aktif" className="font-semibold underline">Lihat kendaraan aktif</Link>
      </div>
    );
  }
  return <Checkout tx={state.tx} source={state.source} />;
}

function Checkout({ tx, source }: { tx: TxDetail; source: string }) {
  const router = useRouter();
  const { user, assignment } = useSession();
  const active = assignment.active!;
  const [ids] = useState(() => ({ checkout: crypto.randomUUID() }));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<Date | null>(null);

  const options = tx.template.conditions ?? [];
  const condLabel = (id?: string | null) => options.find((o) => o.id === id)?.label;
  const inChecks = tx.checks.filter((c) => c.phase === "in");
  const issues = inChecks.filter((c) => !c.checked);
  const presentIn = tx.inside_items.filter((i) => i.phase === "in" && i.present);
  const alreadyOut = tx.status !== "parked";

  async function submit() {
    setBusy(true);
    setError(null);
    const at = new Date();
    try {
      await enqueueCheckout({
        userId: user.id, postId: active.post.id, txClientId: tx.client_id,
        body: {
          client_id: ids.checkout,
          // Kondisi keluar = kondisi masuk; alur ringkas tanpa pemeriksaan ulang
          checks: inChecks.map((c) => ({ item_id: c.item_id, checked: c.checked, condition: c.condition ?? null })),
          inside_items: presentIn.map((i) => ({ item_id: i.item_id, present: true })),
          photos: [],
          has_new_damage: false,
          checkout_at: at.toISOString(),
        },
        photos: [],
        display: { status: "released", checkout_at: at.toISOString(), checkout_by: { id: user.id, name: user.name } },
      });
      setDoneAt(at);
      setConfirming(false);
    } catch (e) {
      setError(`Gagal menyimpan di HP: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (doneAt) {
    return (
      <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
        <main className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),56px)] pb-6 text-center [&>*]:shrink-0">
          <span aria-hidden="true" className="flex size-[88px] items-center justify-center rounded-full bg-accent"><Check size={44} stroke={2.6} /></span>
          <h1 className="font-display text-[26px] font-bold">Check out berhasil</h1>
          <Plate size="xl">{tx.plate}</Plate>
          <dl className="w-full rounded-[14px] border border-line bg-surface px-4 py-1.5 text-left">
            {([
              ["Masuk", `${clock(tx.checkin_at)} · ${tx.checkin_by?.name ?? "-"}`],
              ["Keluar", `${clock(doneAt)} · ${user.name}`],
              ["Durasi", duration(minutesSince(tx.checkin_at, doneAt.toISOString()))],
            ] as const).map(([k, v], i) => (
              <div key={k} className={`flex justify-between gap-3 py-2.5 ${i ? "border-t border-line-2" : ""}`}>
                <dt className="text-sm text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-muted">Di-check out oleh <strong className="text-ink">{user.name}</strong>.</p>
        </main>
        <footer className="safe-bottom flex gap-2.5 border-t border-line bg-surface px-5 pt-3">
          <button onClick={() => router.push("/aktif")} className={btnGhost}>Check out lagi</button>
          <button onClick={() => router.push("/")} className={`${btnDark} flex-1`}>Kembali ke beranda</button>
        </footer>
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Masuk", `${clock(tx.checkin_at)} · oleh ${tx.checkin_by?.name ?? "-"}`],
    ["Lama parkir", duration(minutesSince(tx.checkin_at, tx.checkout_at))],
    ["Barang di dalam", presentIn.length ? presentIn.map((i) => (i.extra_text ? `${i.label} (${i.extra_text})` : i.label)).join(", ") : "Tidak ada"],
  ];
  if (tx.checkout_by) rows.push(["Keluar", `${clock(tx.checkout_at)} · oleh ${tx.checkout_by.name}`]);

  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
      <header className="flex items-center gap-3 bg-ink px-5 pb-4 pt-[max(env(safe-area-inset-top),20px)] text-on-ink">
        <Link href="/aktif" aria-label="Kembali ke daftar" className="flex size-11 items-center justify-center rounded-xl bg-ink-2"><ChevronLeft /></Link>
        <div className="flex flex-1 flex-col">
          <span className="text-xs text-on-ink-muted">Check Out · {tx.post.name}</span>
          <span className="font-display text-xl font-bold">Detail kendaraan</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-[18px] [&>*]:shrink-0">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-5">
          <Plate size="xl">{tx.plate}</Plate>
          {alreadyOut && <StatusBadge status={tx.status} />}
        </div>
        {source !== "server" && (
          <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">Offline — data dari HP. Check out disimpan dan dikirim otomatis.</p>
        )}

        <dl className="rounded-[14px] border border-line bg-surface px-4 py-1.5">
          {rows.map(([k, v], i) => (
            <div key={k} className={`flex justify-between gap-3 py-2.5 ${i ? "border-t border-line-2" : ""}`}>
              <dt className="shrink-0 text-sm text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        {issues.length > 0 || tx.notes ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#E8D68A] bg-warning-bg px-3.5 py-3 text-[13px] leading-normal text-[#5A4500]">
            <Info size={18} className="mt-px shrink-0" />
            <span>
              <strong>Kondisi saat masuk:</strong>{" "}
              {[...issues.map((c) => `${c.label} ${(condLabel(c.condition) ?? "perlu dicek").toLowerCase()}`), tx.notes].filter(Boolean).join(", ")}
            </span>
          </div>
        ) : inChecks.length > 0 ? (
          <p className="rounded-xl bg-success-bg px-3.5 py-2.5 text-[13px] font-semibold text-success">Kondisi saat masuk: semua bagian mulus.</p>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
      </main>

      <footer className="safe-bottom flex gap-2.5 border-t border-line bg-surface px-5 pt-3">
        {alreadyOut ? (
          <button onClick={() => router.push("/aktif")} className={`${btnDark} flex-1`}>Kembali ke daftar</button>
        ) : (
          <button onClick={() => setConfirming(true)} className={`${btnPrimary} flex-1`}>Check out kendaraan ini</button>
        )}
      </footer>

      {confirming && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-40 flex items-end bg-ink/50" onClick={() => !busy && setConfirming(false)}>
          <div className="safe-bottom mx-auto flex w-full max-w-[480px] flex-col gap-3 rounded-t-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className="font-display text-xl font-bold">Yakin ingin check out?</h2>
            <div className="flex items-center gap-3">
              <Plate size="lg">{tx.plate}</Plate>
              <span className="text-sm text-muted">masuk {clock(tx.checkin_at)} · {duration(minutesSince(tx.checkin_at), true)}</span>
            </div>
            <p className="text-sm text-muted">Dicatat atas nama <strong className="text-ink">{user.name}</strong>.</p>
            <button onClick={submit} disabled={busy} className={btnPrimary}>{busy && <Spinner />}Ya, check out</button>
            <button onClick={() => setConfirming(false)} disabled={busy} className="min-h-12 font-semibold text-muted">Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}
