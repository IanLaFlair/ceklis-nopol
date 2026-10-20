"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCapture, Thumb, type Shot } from "@/components/petugas/photo-input";
import { useSession } from "@/components/petugas/session";
import { carLine } from "@/components/petugas/vehicle-row";
import { Camera, CarOutline, Check, ChevronLeft, Close, Info, Shield } from "@/components/icons";
import { btnDark, btnGhost, chip, ErrorNote, Plate, Spinner } from "@/components/ui";
import { api } from "@/lib/api/client";
import { clock, duration, minutesSince, SIDE_LABEL } from "@/lib/format";
import { enqueueCheckout } from "@/lib/offline/queue";
import { loadTransaction, useLocalPhotos } from "@/lib/petugas/data";
import { exteriorItems } from "@/lib/summary";
import type { TxDetail } from "@/lib/types";

const SIDES = ["depan", "belakang", "kiri", "kanan"] as const;
const DISCLAIMER =
  "Sistem menyimpan perbandingan ini sebagai bahan pemeriksaan, bukan otomatis menetapkan siapa yang bertanggung jawab.";

type Mode = "compare" | "normal" | "incident" | "sent";

/** id bisa angka (server) atau UUID dari HP. Dibaca dari URL supaya shell offline tetap bekerja. */
function useRef_(): string | null {
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    setRef(decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[1] ?? ""));
  }, []);
  return ref;
}

export default function CheckoutPage() {
  const ref = useRef_();
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
        <h1 className="font-display text-2xl font-bold">Transaksi tidak ditemukan</h1>
        <p className="text-muted">Kendaraan ini tidak ada di pos kamu, atau belum tersimpan di HP saat offline.</p>
        <Link href="/aktif" className="font-semibold underline">Lihat kendaraan aktif</Link>
      </div>
    );
  }
  return <Checkout tx={state.tx} source={state.source} reload={reload} />;
}

function Checkout({ tx, source, reload }: { tx: TxDetail; source: string; reload: () => Promise<void> }) {
  const router = useRouter();
  const { user, assignment } = useSession();
  const active = assignment.active!;
  const config = tx.template;
  const required = config.photo_mode === "required_4_sides" ? config.required_sides : [];
  const local = useLocalPhotos(tx.client_id);

  const [ids] = useState(() => ({ checkout: crypto.randomUUID(), incident: crypto.randomUUID() }));
  const [mode, setMode] = useState<Mode>(tx.status === "parked" ? "compare" : "sent");
  const [side, setSide] = useState<(typeof SIDES)[number]>("depan");
  const [outPhotos, setOutPhotos] = useState<Partial<Record<string, Shot>>>({});
  const [insideOk, setInsideOk] = useState<Record<string, boolean>>({});
  const [parts, setParts] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Shot[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<Date | null>(null);
  const capSide = useRef<string>("depan");

  const outCam = useCapture((s) => setOutPhotos((p) => ({ ...p, [capSide.current]: s })));
  const evCam = useCapture((s) => setEvidence((e) => [...e, s]));

  const inChecks = tx.checks.filter((c) => c.phase === "in");
  const presentIn = tx.inside_items.filter((i) => i.phase === "in" && i.present);
  const issues = inChecks.filter((c) => !c.checked);
  const exterior = useMemo(() => exteriorItems(config), [config]);

  const inPhoto = (s: string) => {
    const server = tx.photos.find((p) => p.phase === "in" && p.side === s && !p.item_id);
    const mine = local.find((p) => p.phase === "in" && p.side === s && !p.item_id);
    return { blob: mine?.blob, src: server?.thumb_url ?? server?.url };
  };

  async function submit(hasDamage: boolean) {
    const miss = required.filter((s) => !outPhotos[s]);
    if (miss.length) {
      setError(`Foto ulang dulu: ${miss.map((m) => SIDE_LABEL[m].toLowerCase()).join(", ")}.`);
      return;
    }
    if (hasDamage && !parts.length && !note.trim()) {
      setError("Pilih bagian yang berbeda atau isi catatan.");
      return;
    }
    setBusy(true);
    setError(null);
    const at = new Date();
    const sidePhotos = SIDES.filter((s) => outPhotos[s]).map((s) => ({ ...outPhotos[s]!, side: s as string }));
    const partIds = new Set(exterior.filter((i) => parts.includes(i.label)).map((i) => i.id));
    const body = {
      client_id: ids.checkout,
      checks: inChecks.map((c) => ({ item_id: c.item_id, checked: c.checked && !partIds.has(c.item_id) })),
      inside_items: presentIn.map((i) => ({ item_id: i.item_id, present: insideOk[i.item_id] ?? true })),
      photos: sidePhotos.map((p) => ({ client_id: p.id, side: p.side, taken_at: p.at.toISOString() })),
      has_new_damage: hasDamage,
      incident: hasDamage
        ? { client_id: ids.incident, parts, note: note || null, photos: evidence.map((e) => ({ client_id: e.id, side: "detail", taken_at: e.at.toISOString() })) }
        : null,
      checkout_at: at.toISOString(),
    };
    try {
      await enqueueCheckout({
        userId: user.id, postId: active.post.id, txClientId: tx.client_id, body,
        photos: [...sidePhotos.map((p) => ({ id: p.id, side: p.side, blob: p.blob })), ...evidence.map((e) => ({ id: e.id, side: "detail", blob: e.blob }))],
        display: {
          status: hasDamage ? "incident_pending" : "released", checkout_at: at.toISOString(),
          checkout_by: { id: user.id, name: user.name },
        },
      });
      setDoneAt(at);
      setMode(hasDamage ? "sent" : "normal");
    } catch (e) {
      setError(`Gagal menyimpan di HP: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      await api(`/transactions/${tx.id}/release`, { method: "POST" });
      await reload();
      setMode("normal");
      setDoneAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = { compare: "Bandingkan kondisi", normal: "Selesai", incident: "Laporkan kerusakan", sent: "Insiden" }[mode];
  const inc = tx.incidents.at(-1);

  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
      <header className="flex items-center gap-3 bg-ink px-5 pb-4 pt-[max(env(safe-area-inset-top),20px)] text-on-ink">
        <Link href="/" aria-label="Kembali ke beranda" className="flex size-11 items-center justify-center rounded-xl bg-ink-2"><ChevronLeft /></Link>
        <div className="flex flex-1 flex-col">
          <span className="text-xs text-on-ink-muted">Check Out · {tx.post.name}</span>
          <span className="font-display text-xl font-bold">{title}</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-[18px]">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
          <Plate size="lg">{tx.plate}</Plate>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">{carLine(tx)}</span>
            <span className="text-xs text-muted">
              {[tx.slot && `Slot ${tx.slot}`, tx.key_tag && `kunci ${tx.key_tag}`, `masuk ${clock(tx.checkin_at)} oleh ${tx.checkin_by?.name ?? "-"}`].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
        {source !== "server" && (
          <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
            Offline — data dari HP. Check out tetap disimpan dan dikirim otomatis.
          </p>
        )}

        {mode === "compare" && (
          <>
            {(tx.notes || issues.length > 0) && (
              <div className="flex items-start gap-2.5 rounded-xl border border-[#E8D68A] bg-warning-bg px-3.5 py-3 text-[13px] leading-normal text-[#5A4500]">
                <Info size={18} className="mt-px shrink-0" />
                <span>
                  <strong>Catatan saat masuk:</strong>{" "}
                  {[...issues.map((c) => `${c.label} perlu dicek${c.note ? ` — ${c.note}` : ""}`), tx.notes].filter(Boolean).join(". ")}
                </span>
              </div>
            )}
            <section className="flex flex-col gap-2.5">
              <h2 className="font-display text-lg font-bold">Bandingkan foto</h2>
              <div role="tablist" aria-label="Sisi kendaraan" className="grid grid-cols-4 gap-1.5">
                {SIDES.map((s) => (
                  <button key={s} role="tab" aria-selected={side === s} onClick={() => setSide(s)}
                    className={`relative min-h-11 rounded-[10px] text-[13px] font-semibold ${side === s ? "bg-ink text-on-ink" : "border-[1.5px] border-field bg-surface"}`}>
                    {SIDE_LABEL[s]}
                    {outPhotos[s] && <Check size={12} stroke={3} className="absolute right-1.5 top-1.5 text-accent" />}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <div className="relative flex h-[132px] items-center justify-center overflow-hidden rounded-[14px] bg-ink-2 text-[#6F746E]">
                    <CarOutline width={70} height={42} />
                    <Thumb {...inPhoto(side)} alt={`Foto ${SIDE_LABEL[side]} saat masuk`} />
                    <span className="absolute left-2 top-2 rounded bg-ink/70 px-1 text-[11px] text-[#C9CCC6]">{SIDE_LABEL[side]}</span>
                  </div>
                  <span className="text-xs text-muted">Check in · {clock(tx.checkin_at)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => { capSide.current = side; outCam.open(); }} aria-label={`Foto ${SIDE_LABEL[side]} saat keluar`}
                    className={`relative flex h-[132px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[14px] border-2 ${outPhotos[side] ? "border-ink bg-ink text-accent" : "border-dashed border-[#9A9F99] bg-surface text-muted"}`}>
                    <Thumb blob={outPhotos[side]?.blob} alt="" />
                    <span className="relative flex flex-col items-center gap-1.5 rounded-lg px-2 py-1 [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]">
                      <Camera size={26} />
                      <span className="text-[13px] font-semibold">{outCam.busy ? "Memproses…" : outPhotos[side] ? "Ulangi foto" : "Foto sekarang"}</span>
                    </span>
                  </button>
                  <span className="text-xs text-muted">Check out · sekarang</span>
                </div>
              </div>
              {outCam.input}
              <span className="text-[13px] text-muted">
                {SIDES.filter((s) => outPhotos[s]).length} dari {required.length || 4} sisi sudah difoto ulang
              </span>
            </section>

            {presentIn.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-lg font-bold">Barang di dalam</h2>
                {presentIn.map((i) => (
                  <label key={i.item_id} className="flex min-h-[52px] items-center gap-3 rounded-xl border-[1.5px] border-field bg-surface px-3.5 text-[15px]">
                    <input type="checkbox" checked={insideOk[i.item_id] ?? true} onChange={(e) => setInsideOk((s) => ({ ...s, [i.item_id]: e.target.checked }))}
                      className="size-[22px] accent-ink" />
                    {i.label}{i.extra_text ? ` (${i.extra_text})` : ""} masih ada
                  </label>
                ))}
              </section>
            )}

            <section className="flex flex-col gap-3.5 rounded-[18px] bg-ink p-[18px] text-on-ink">
              <h2 className="text-center font-display text-[19px] font-bold">Ada kerusakan baru?</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => submit(false)} disabled={busy}
                  className="tap flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-accent text-base font-bold text-ink">
                  {busy && <Spinner />}Tidak ada
                </button>
                <button onClick={() => { setError(null); setMode("incident"); }}
                  className="tap min-h-14 rounded-[14px] border-[1.5px] border-[#F2A07B] text-base font-bold text-danger-soft">Ya, ada</button>
              </div>
            </section>
            <p className="text-xs leading-normal text-muted">{DISCLAIMER}</p>
          </>
        )}

        {mode === "normal" && (
          <div className="flex flex-col items-center gap-4 py-5 text-center">
            <span aria-hidden="true" className="flex size-[88px] items-center justify-center rounded-full bg-accent"><Check size={44} stroke={2.6} /></span>
            <h2 className="font-display text-[26px] font-bold">Kendaraan diserahkan</h2>
            <p className="text-[15px] leading-normal text-muted">Kondisi sama seperti saat masuk. Transaksi ditutup.</p>
            <dl className="w-full rounded-[14px] border border-line bg-surface px-4 py-1.5 text-left">
              {([
                ["Masuk", `${clock(tx.checkin_at)} · ${tx.checkin_by?.name ?? "-"}`],
                ["Keluar", `${clock(doneAt)} · ${user.name}`],
                ["Durasi", duration(minutesSince(tx.checkin_at, doneAt?.toISOString()))],
              ] as const).map(([k, v], i) => (
                <div key={k} className={`flex justify-between py-2.5 ${i ? "border-t border-line-2" : ""}`}>
                  <dt className="text-sm text-muted">{k}</dt><dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {mode === "incident" && (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Bagian yang berbeda</legend>
              <div className="flex flex-wrap gap-2">
                {exterior.map((it) => {
                  const on = parts.includes(it.label);
                  return (
                    <button key={it.id} aria-pressed={on} onClick={() => setParts((p) => (on ? p.filter((x) => x !== it.label) : [...p, it.label]))}
                      className={on ? "tap inline-flex min-h-11 items-center rounded-full border-[1.5px] border-danger bg-danger-bg px-3.5 text-sm font-semibold text-danger-ink" : chip(false)}>
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {evidence.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {evidence.map((e) => (
                  <div key={e.id} className="relative h-24 overflow-hidden rounded-xl bg-ink">
                    <Thumb blob={e.blob} alt="Foto bukti" />
                    <button onClick={() => setEvidence((x) => x.filter((y) => y.id !== e.id))} aria-label="Hapus foto"
                      className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg bg-ink/80 text-on-ink"><Close size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={evCam.open}
              className="flex min-h-[110px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-danger bg-surface text-[15px] font-semibold text-danger-ink">
              {evCam.busy ? <Spinner /> : <Camera size={26} />}Foto bukti close-up
            </button>
            {evCam.input}
            <label className="flex flex-col gap-2 text-sm font-semibold">Catatan petugas
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Jelaskan yang berbeda dari foto check in"
                className="resize-none rounded-xl border-[1.5px] border-field bg-surface px-3.5 py-3 text-[15px] font-normal outline-none focus:border-ink" />
            </label>
            <p className="text-xs leading-normal text-muted">{DISCLAIMER}</p>
          </>
        )}

        {mode === "sent" && (
          <div className="flex flex-col items-center gap-3.5 py-4 text-center">
            <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-full border-2 border-danger bg-danger-bg text-danger-ink"><Shield size={38} stroke={2.2} /></span>
            {tx.status === "incident_confirmed" ? (
              <>
                <h2 className="font-display text-2xl font-bold">Kerusakan dicatat</h2>
                <p className="text-[15px] leading-normal text-muted">
                  Supervisor sudah memutuskan{inc?.decision_note ? `: “${inc.decision_note}”` : ""}. Kendaraan bisa diserahkan ke pemilik.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold">Menunggu supervisor</h2>
                <p className="text-[15px] leading-normal text-muted">
                  {inc ? `Insiden ${inc.code} terkirim.` : "Insiden tersimpan dan dikirim saat ada sinyal."} Kendaraan bisa diserahkan setelah supervisor mengonfirmasi.
                </p>
                <button onClick={() => void reload()} className="text-sm font-semibold underline">Cek keputusan</button>
              </>
            )}
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </main>

      <footer className="safe-bottom flex gap-2.5 border-t border-line bg-surface px-5 pt-3">
        {mode === "compare" && (
          <span className="flex min-h-14 flex-1 items-center justify-center text-center text-[13px] text-muted">Foto ulang tiap sisi, lalu jawab pertanyaan di atas.</span>
        )}
        {mode === "incident" && (
          <>
            <button onClick={() => setMode("compare")} className={btnGhost}>Batal</button>
            <button onClick={() => submit(true)} disabled={busy}
              className="tap flex min-h-14 flex-1 items-center justify-center gap-2 rounded-[14px] bg-danger text-base font-bold text-white disabled:opacity-50">
              {busy && <Spinner />}Kirim ke supervisor
            </button>
          </>
        )}
        {mode === "sent" && tx.status === "incident_confirmed" && (
          <button onClick={release} disabled={busy} className={`${btnDark} flex-1`}>{busy && <Spinner />}Serahkan kendaraan</button>
        )}
        {(mode === "normal" || (mode === "sent" && tx.status !== "incident_confirmed")) && (
          <button onClick={() => router.push("/")} className={`${btnDark} flex-1`}>Kembali ke beranda</button>
        )}
      </footer>
    </div>
  );
}
