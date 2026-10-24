"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useCapture, Thumb, type Shot } from "@/components/petugas/photo-input";
import { useSession } from "@/components/petugas/session";
import { Camera, Check, Close, ScanPlate } from "@/components/icons";
import { btnDark, btnGhost, btnPrimary, ErrorNote, field, label, Plate, Spinner, Tick } from "@/components/ui";
import { scanPlate } from "@/lib/camera/scan";
import { clock, displayPlate, normalizePlate, SIDE_LABEL } from "@/lib/format";
import { useOnline } from "@/lib/offline/hooks";
import { enqueueCheckin } from "@/lib/offline/queue";
import { buildSummary, exteriorItems, insideItems, insideList, type InsideState } from "@/lib/summary";
import { newTicketCode } from "@/lib/ticket";
import type { ConditionOption } from "@/lib/types";

const TITLES = ["Nomor polisi", "Checklist"];
// Dipakai kalau template lama belum punya daftar kondisi
const FALLBACK_CONDITIONS: ConditionOption[] = [
  { id: "mulus", label: "Mulus", ok: true },
  { id: "penyok", label: "Penyok", ok: false },
  { id: "lecet", label: "Lecet", ok: false },
];

export default function CheckinPage() {
  const router = useRouter();
  const online = useOnline();
  const { user, assignment, pending } = useSession();
  const active = assignment.active!;
  const template = assignment.template;
  const config = template?.config;

  const [ids, setIds] = useState(() => ({ client: crypto.randomUUID(), ticket: newTicketCode() }));
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [plate, setPlate] = useState("");
  const [scan, setScan] = useState<{ busy: boolean; note: string | null; confidence?: number; scanned?: string }>({ busy: false, note: null });

  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [itemPhotos, setItemPhotos] = useState<Record<string, Shot>>({});
  const [sidePhotos, setSidePhotos] = useState<Partial<Record<string, Shot>>>({});
  const [inside, setInside] = useState<InsideState>({});
  const [notes, setNotes] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const plateShown = displayPlate(plate) || "—";
  const exterior = useMemo(() => (config ? exteriorItems(config) : []), [config]);
  const insides = useMemo(() => (config ? insideItems(config) : []), [config]);
  const options = config?.conditions?.length ? config.conditions : FALLBACK_CONDITIONS;
  // Foto sisi hanya kalau template lokasi masih mewajibkan (default "Standar Mobil": tidak)
  const requiredSides = config?.photo_mode === "required_4_sides" ? config.required_sides : [];
  const photoFor = useRef<string | null>(null);
  const sideFor = useRef<string | null>(null);

  const itemCam = useCapture((s) => photoFor.current && setItemPhotos((p) => ({ ...p, [photoFor.current!]: s })));
  const sideCam = useCapture((s) => sideFor.current && setSidePhotos((p) => ({ ...p, [sideFor.current!]: s })));
  const plateCam = useScanInput(async (file) => {
    setScan({ busy: true, note: null });
    try {
      const r = await scanPlate(file);
      setPlate(r.plate);
      setScan({
        busy: false, scanned: r.plate, confidence: r.confidence,
        note: r.needs_confirmation ? "Kurang yakin — cocokkan dengan plat asli sebelum lanjut." : null,
      });
    } catch (e) {
      setScan({ busy: false, note: (e as Error).message });
    }
  });

  const isOk = (id: string) => !!options.find((o) => o.id === conditions[id])?.ok;
  const filled = exterior.filter((it) => conditions[it.id]).length;

  if (!config || !template) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-3 p-6">
        <h1 className="font-display text-2xl font-bold">Template belum dipasang</h1>
        <p className="text-muted">Lokasi {active.site.name} belum punya template checklist. Hubungi admin.</p>
        <Link href="/" className="font-semibold underline">Kembali ke beranda</Link>
      </div>
    );
  }

  function validate(s: number): string | null {
    if (s === 1) return normalizePlate(plate).length < 2 ? "Isi nomor polisi dulu." : null;
    const missingSides = requiredSides.filter((side) => !sidePhotos[side]);
    if (missingSides.length) return `Foto wajib: ${missingSides.map((m) => SIDE_LABEL[m].toLowerCase()).join(", ")}.`;
    const empty = exterior.filter((it) => !conditions[it.id]);
    if (empty.length) {
      setShowMissing(true);
      document.getElementById(`kondisi-${empty[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return empty.length === 1 ? `Pilih kondisi ${empty[0].label}.` : `Pilih kondisi semua bagian — ${empty.length} belum diisi (ditandai merah).`;
    }
    const needPhoto = exterior.filter(
      (it) => !isOk(it.id) && it.requires_photo_if_unchecked && config!.photo_mode !== "off" && !itemPhotos[it.id],
    );
    if (needPhoto.length) return `Foto close-up wajib: ${needPhoto.map((i) => i.label).join(", ")}.`;
    const noPhoto = insides.filter((it) => it.requires_photo_if_present && inside[it.id]?.present && !itemPhotos[it.id]);
    if (noPhoto.length) return `Barang di dalam wajib difoto: ${noPhoto.map((i) => i.label).join(", ")}.`;
    return null;
  }

  async function save() {
    setSaving(true);
    const at = new Date();
    const keepPhoto = (id: string) =>
      exterior.some((it) => it.id === id && !isOk(id)) || insides.some((it) => it.id === id && inside[id]?.present);
    const photos = [
      ...Object.entries(sidePhotos).filter(([side]) => requiredSides.includes(side as never))
        .map(([side, s]) => ({ ...s!, side, item_id: null as string | null })),
      ...Object.entries(itemPhotos).filter(([id]) => keepPhoto(id)).map(([id, s]) => ({ ...s, side: "detail", item_id: id })),
    ];
    const checks = exterior.map((it) => ({ item_id: it.id, condition: conditions[it.id], checked: isOk(it.id) }));
    const checked = Object.fromEntries(checks.map((c) => [c.item_id, c.checked]));
    const insideRows = insides.map((it) => ({ item_id: it.id, present: !!inside[it.id]?.present, extra_text: inside[it.id]?.extra || null }));
    const body = {
      client_id: ids.client, post_id: active.post.id, template_version_id: template!.version_id, ticket_code: ids.ticket,
      plate: plateShown, checks, inside_items: insideRows, notes: notes || null, checkin_at: at.toISOString(),
      photos: photos.map((p) => ({ client_id: p.id, side: p.side, item_id: p.item_id, taken_at: p.at.toISOString() })),
    };
    const display = {
      id: 0, client_id: ids.client, ticket_code: ids.ticket, status: "parked", plate: plateShown, vehicle_type: null,
      color: null, make_model: null, slot: null, key_tag: null, vip: false, notes: notes || null,
      has_issue: checks.some((c) => !c.checked), owner_phone: null,
      post: active.post, site: { id: active.site.id, name: active.site.name }, checkin_at: at.toISOString(),
      checkin_by: { id: user.id, name: user.name }, checkout_at: null, checkout_by: null, released_at: null, duration_minutes: 0,
      template_version_id: template!.version_id, template: config, incidents: [], photos: [], photos_complete: false,
      summary_text: buildSummary(config!, plateShown, checked, inside, notes, conditions),
      checks: exterior.map((it, i) => ({ phase: "in", item_id: it.id, label: it.label, group: it.group, checked: checks[i].checked, condition: checks[i].condition, note: null })),
      inside_items: insides.map((it, i) => ({ phase: "in", item_id: it.id, label: it.label, present: insideRows[i].present, extra_text: insideRows[i].extra_text })),
    };
    try {
      await enqueueCheckin({ userId: user.id, postId: active.post.id, body, photos: photos.map((p) => ({ id: p.id, side: p.side, item_id: p.item_id, blob: p.blob })), display });
      setSavedAt(at);
      setStep(3);
    } catch (e) {
      setError(`Gagal menyimpan di HP: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function next() {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    if (step === 2) void save();
    else setStep(step + 1);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  function close() {
    if (step < 3 && (plate || filled) && !window.confirm("Batalkan check in ini? Data yang sudah diisi akan hilang.")) return;
    router.push("/");
  }

  function again() {
    setIds({ client: crypto.randomUUID(), ticket: newTicketCode() });
    setPlate("");
    setScan({ busy: false, note: null });
    setConditions({});
    setItemPhotos({});
    setSidePhotos({});
    setInside({});
    setNotes("");
    setShowMissing(false);
    setSavedAt(null);
    setError(null);
    setStep(1);
  }

  if (step === 3 && savedAt) {
    const bad = exterior.filter((it) => !isOk(it.id));
    return (
      <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
        <main className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),56px)] pb-6 text-center [&>*]:shrink-0">
          <span aria-hidden="true" className="flex size-[88px] items-center justify-center rounded-full bg-accent"><Check size={44} stroke={2.6} /></span>
          <h1 className="font-display text-[26px] font-bold">Check in berhasil</h1>
          <Plate size="xl">{plateShown}</Plate>
          <dl className="w-full rounded-[14px] border border-line bg-surface px-4 py-1.5 text-left">
            {([
              ["Pos", `${active.site.name} · ${active.post.name}`],
              ["Waktu masuk", `${clock(savedAt)} · oleh ${user.name}`],
              ["Kondisi", bad.length ? `${exterior.length - bad.length} mulus · ${bad.length} ${bad.map((b) => `${b.label.toLowerCase()} (${options.find((o) => o.id === conditions[b.id])?.label.toLowerCase()})`).join(", ")}` : `Semua ${exterior.length} bagian mulus`],
              ["Barang di dalam", insideList(config, inside)],
            ] as const).map(([k, v], i) => (
              <div key={k} className={`flex justify-between gap-3 py-2.5 ${i ? "border-t border-line-2" : ""}`}>
                <dt className="shrink-0 text-sm text-muted">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-muted">
            {online && !pending.total ? "Tersimpan di server." : "Tersimpan di HP, dikirim otomatis saat ada sinyal."}
          </p>
        </main>
        <footer className="safe-bottom flex gap-2.5 border-t border-line bg-surface px-5 pt-3">
          <button onClick={again} className={btnGhost}>Check in lagi</button>
          <button onClick={() => router.push("/")} className={`${btnDark} flex-1`}>Kembali ke beranda</button>
        </footer>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
      <header className="flex flex-col gap-3.5 bg-ink px-5 pb-4 pt-[max(env(safe-area-inset-top),20px)] text-on-ink">
        <div className="flex items-center gap-3">
          <button onClick={close} aria-label="Tutup" className="flex size-11 items-center justify-center rounded-xl bg-ink-2"><Close /></button>
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-on-ink-muted">Check In · {active.post.name} · langkah {step} dari 2</span>
            <span className="font-display text-xl font-bold">{TITLES[step - 1]}</span>
          </div>
          {step > 1 && <Plate size="sm" accent>{plateShown}</Plate>}
        </div>
        <div aria-hidden="true" className="grid grid-cols-2 gap-1.5">
          {[1, 2].map((n) => <span key={n} className={`h-[5px] rounded-[3px] ${n <= step ? "bg-accent" : "bg-ink-3"}`} />)}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-5 pb-6 pt-[18px] [&>*]:shrink-0">
        {step === 1 && (
          <>
            <div className="relative flex h-[170px] items-center justify-center overflow-hidden rounded-2xl bg-[#161917] bg-[linear-gradient(#1D201E_1px,transparent_1px),linear-gradient(90deg,#1D201E_1px,transparent_1px)] bg-[size:24px_24px]">
              {["left-3 top-3 border-l-[3px] border-t-[3px]", "right-3 top-3 border-r-[3px] border-t-[3px]",
                "bottom-3 left-3 border-b-[3px] border-l-[3px]", "bottom-3 right-3 border-b-[3px] border-r-[3px]"].map((c) => (
                <span key={c} aria-hidden="true" className={`absolute size-[22px] border-accent ${c}`} />
              ))}
              {scan.scanned && normalizePlate(scan.scanned) === normalizePlate(plate) ? (
                <div className="flex flex-col items-center gap-2.5">
                  <span className="rounded border-2 border-[#111] bg-plate px-4 py-1.5 font-mono text-[26px] font-bold outline-2 outline-offset-[5px] outline-accent">{scan.scanned}</span>
                  <span className="text-xs text-[#C9CCC6]">Terbaca otomatis — cocokkan dengan plat asli</span>
                  <button onClick={plateCam.open} className="text-xs text-on-ink-muted underline">Scan ulang</button>
                </div>
              ) : (
                <>
                  {!scan.busy && <div className="scanline" aria-hidden="true" />}
                  <button onClick={plateCam.open} disabled={scan.busy}
                    className="tap relative z-[1] flex min-h-[52px] items-center gap-2.5 rounded-xl bg-accent px-5 text-base font-bold text-ink">
                    {scan.busy ? <Spinner /> : <ScanPlate />}
                    {scan.busy ? "Membaca plat…" : "Scan plat"}
                  </button>
                </>
              )}
              {plateCam.input}
            </div>
            {scan.note && <p className="-mt-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">{scan.note}</p>}
            <label className={label}>
              Nomor polisi
              <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="B 1234 ABC"
                autoCapitalize="characters" autoComplete="off" enterKeyHint="next"
                onKeyDown={(e) => e.key === "Enter" && next()}
                className={`${field} min-h-14 font-mono text-xl font-bold uppercase`} />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm leading-normal text-muted">
              Pilih kondisi tiap bagian. Semua wajib diisi.{" "}
              <span className="font-mono font-bold text-ink">{filled}/{exterior.length}</span>
            </p>

            {requiredSides.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-[17px] font-bold">Foto sisi kendaraan</h2>
                <div className="grid grid-cols-4 gap-2">
                  {requiredSides.map((side) => (
                    <button key={side} onClick={() => { sideFor.current = side; sideCam.open(); }} aria-label={`Foto ${SIDE_LABEL[side]}`}
                      className={`relative flex h-20 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 text-xs font-semibold ${sidePhotos[side] ? "border-ink bg-ink text-accent" : "border-dashed border-[#9A9F99] bg-surface text-muted"}`}>
                      <Thumb blob={sidePhotos[side]?.blob} alt="" className="opacity-50" />
                      <Camera size={18} className="relative" /><span className="relative">{SIDE_LABEL[side]}</span>
                    </button>
                  ))}
                </div>
                {sideCam.input}
              </section>
            )}

            {config.groups.filter((g) => g.items.some((i) => i.kind === "exterior")).map((g) => (
              <section key={g.id} className="flex flex-col gap-2">
                <h2 className="font-display text-[17px] font-bold">{g.title}</h2>
                <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
                  {g.items.filter((i) => i.kind === "exterior").map((it, i) => {
                    const picked = conditions[it.id];
                    const damaged = picked && !isOk(it.id);
                    return (
                      <div key={it.id} id={`kondisi-${it.id}`}
                        className={`flex flex-col gap-2.5 px-4 py-3 ${i ? "border-t border-line-2" : ""} ${showMissing && !picked ? "bg-danger-bg" : ""}`}>
                        <div className="flex items-center gap-2">
                          <span className={`flex-1 text-base ${picked ? "font-semibold" : ""}`}>{it.label}</span>
                          {damaged && (
                            <button onClick={() => { photoFor.current = it.id; itemCam.open(); }} aria-label={`Foto ${it.label}`}
                              className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-2 ${itemPhotos[it.id] ? "border-ink" : "border-dashed border-danger text-danger-ink"}`}>
                              <Thumb blob={itemPhotos[it.id]?.blob} alt="" />
                              {!itemPhotos[it.id] && <Camera size={18} />}
                            </button>
                          )}
                        </div>
                        <div role="radiogroup" aria-label={`Kondisi ${it.label}`} className="grid grid-cols-3 gap-1.5">
                          {options.map((o) => {
                            const on = picked === o.id;
                            return (
                              <button key={o.id} role="radio" aria-checked={on} onClick={() => setConditions((c) => ({ ...c, [it.id]: o.id }))}
                                className={`min-h-11 rounded-[10px] border-[1.5px] text-sm font-semibold ${on ? (o.ok ? "border-ink bg-accent text-ink" : "border-danger bg-danger-bg text-danger-ink") : "border-field bg-surface text-ink"}`}>
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {insides.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-lg font-bold">Barang di dalam</h2>
                <span className="text-[13px] text-muted">Centang yang ada di kendaraan, lalu foto barangnya.</span>
                <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
                  {insides.map((it, i) => {
                    const on = !!inside[it.id]?.present;
                    return (
                      <div key={it.id} className={`flex flex-col gap-2 px-4 py-2.5 ${i ? "border-t border-line-2" : ""}`}>
                        <div className="flex items-center gap-3">
                          <button aria-pressed={on} onClick={() => setInside((s) => ({ ...s, [it.id]: { ...s[it.id], present: !on } }))}
                            className="flex min-h-11 flex-1 items-center gap-3 text-left text-[15px]">
                            <Tick on={on} size={26} /><span className={on ? "font-semibold" : ""}>{it.label}</span>
                          </button>
                          {on && (
                            <button onClick={() => { photoFor.current = it.id; itemCam.open(); }} aria-label={`Foto ${it.label}`}
                              className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-2 ${itemPhotos[it.id] ? "border-ink" : it.requires_photo_if_present ? "border-dashed border-danger text-danger-ink" : "border-dashed border-[#9A9F99] text-muted"}`}>
                              <Thumb blob={itemPhotos[it.id]?.blob} alt="" />
                              {!itemPhotos[it.id] && <Camera size={18} />}
                            </button>
                          )}
                        </div>
                        {on && it.free_text && (
                          <input value={inside[it.id]?.extra ?? ""} onChange={(e) => setInside((s) => ({ ...s, [it.id]: { present: true, extra: e.target.value } }))}
                            placeholder="Sebutkan barangnya" aria-label={`${it.label}, sebutkan barangnya`} className={field} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {itemCam.input}

            <label className={label}>Catatan <span className="font-normal text-muted">(opsional)</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="resize-none rounded-xl border-[1.5px] border-field bg-surface px-3.5 py-3 text-[15px] font-normal outline-none focus:border-ink" />
            </label>
          </>
        )}
      </main>

      <footer className="safe-bottom flex flex-col gap-2.5 border-t border-line bg-surface px-5 pt-3">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2.5">
          {step > 1 && <button onClick={() => { setError(null); setStep(step - 1); }} className={btnGhost}>Kembali</button>}
          <button onClick={next} disabled={saving} className={`${btnPrimary} flex-1`}>
            {saving && <Spinner />}{step === 2 ? "Simpan check in" : "Lanjut"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function useScanInput(onFile: (f: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  return {
    open: () => ref.current?.click(),
    input: (
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    ),
  };
}
