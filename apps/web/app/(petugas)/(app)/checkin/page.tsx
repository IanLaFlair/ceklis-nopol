"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCapture, Thumb, shotLabel, type Shot } from "@/components/petugas/photo-input";
import { useSession } from "@/components/petugas/session";
import { Camera, CarOutline, Close, Plus, ScanPlate, WhatsApp } from "@/components/icons";
import { btnDark, btnGhost, btnPrimary, chip, ErrorNote, field, label, Plate, Spinner, Tick } from "@/components/ui";
import { scanPlate } from "@/lib/camera/scan";
import { clock, displayPlate, normalizePlate, SIDE_LABEL } from "@/lib/format";
import { enqueueCheckin } from "@/lib/offline/queue";
import { buildSummary, exteriorItems, insideItems, insideList, summaryRows, type InsideState } from "@/lib/summary";
import { newTicketCode } from "@/lib/ticket";
import type { TemplateItem } from "@/lib/types";
import { ticketMessage, waLink } from "@/lib/whatsapp";

const TITLES = ["Data kendaraan", "Foto kondisi awal", "Checklist", "Tiket cek list"];
const TYPES = ["Sedan", "SUV / MPV", "Hatchback", "Lainnya"];
const COLORS: [string, string][] = [
  ["Hitam", "#111111"], ["Putih", "#FFFFFF"], ["Silver", "#C8CBCF"],
  ["Abu-abu", "#6B6F73"], ["Merah", "#B91C1C"], ["Biru", "#1E40AF"],
];
const SIDES = ["depan", "belakang", "kiri", "kanan"] as const;

export default function CheckinPage() {
  const router = useRouter();
  const { user, assignment } = useSession();
  const active = assignment.active!;
  const template = assignment.template;
  const config = template?.config;

  const [ids] = useState(() => ({ client: crypto.randomUUID(), ticket: newTicketCode() }));
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // langkah 1
  const [plate, setPlate] = useState("");
  const [scan, setScan] = useState<{ busy: boolean; note: string | null; confidence?: number; scanned?: string }>({ busy: false, note: null });
  const [vehicleType, setVehicleType] = useState("SUV / MPV");
  const [color, setColor] = useState("Hitam");
  const [makeModel, setMakeModel] = useState("");
  const [slot, setSlot] = useState("");
  const [keyTag, setKeyTag] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [vip, setVip] = useState(false);

  // langkah 2
  const [sidePhotos, setSidePhotos] = useState<Partial<Record<string, Shot>>>({});
  const [damage, setDamage] = useState<Shot[]>([]);

  // langkah 3
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [itemPhotos, setItemPhotos] = useState<Record<string, Shot>>({});
  const [inside, setInside] = useState<InsideState>({});
  const [notes, setNotes] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const plateShown = displayPlate(plate) || "—";
  const exterior = useMemo(() => (config ? exteriorItems(config) : []), [config]);
  const insides = useMemo(() => (config ? insideItems(config) : []), [config]);
  const required = config?.photo_mode === "required_4_sides" ? config.required_sides : [];
  const sideCapture = useRef<string | null>(null);
  const itemCapture = useRef<string | null>(null);

  const sideCam = useCapture((s) => sideCapture.current && setSidePhotos((p) => ({ ...p, [sideCapture.current!]: s })));
  const damageCam = useCapture((s) => setDamage((d) => [...d, s]));
  const itemCam = useCapture((s) => itemCapture.current && setItemPhotos((p) => ({ ...p, [itemCapture.current!]: s })));
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

  const missingItems = exterior.filter(
    (it) => !checked[it.id] && it.requires_photo_if_unchecked && config?.photo_mode !== "off" &&
      (!itemPhotos[it.id] || !(itemNotes[it.id] ?? "").trim()),
  );
  const goodCount = exterior.filter((it) => checked[it.id]).length;
  const summary = config ? buildSummary(config, plateShown, checked, inside, notes) : "";

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
    if (s === 1 && normalizePlate(plate).length < 2) return "Isi nomor polisi dulu.";
    if (s === 2) {
      const miss = required.filter((side) => !sidePhotos[side]);
      if (miss.length) return `Foto wajib: ${miss.map((m) => SIDE_LABEL[m].toLowerCase()).join(", ")}.`;
    }
    if (s === 3 && missingItems.length)
      return `Yang tidak diceklis wajib foto close-up + catatan: ${missingItems.map((i) => i.label).join(", ")}.`;
    return null;
  }

  async function save() {
    setSaving(true);
    const at = new Date();
    const photos = [
      ...SIDES.filter((s) => sidePhotos[s]).map((s) => ({ ...sidePhotos[s]!, side: s, item_id: null })),
      ...damage.map((d) => ({ ...d, side: "detail", item_id: null })),
      ...Object.entries(itemPhotos).filter(([id]) => !checked[id]).map(([id, s]) => ({ ...s, side: "detail", item_id: id })),
    ];
    const checks = exterior.map((it) => ({ item_id: it.id, checked: !!checked[it.id], note: checked[it.id] ? null : itemNotes[it.id] || null }));
    const insideRows = insides.map((it) => ({ item_id: it.id, present: !!inside[it.id]?.present, extra_text: inside[it.id]?.extra || null }));
    const body = {
      client_id: ids.client, post_id: active.post.id, template_version_id: template!.version_id, ticket_code: ids.ticket,
      plate: plateShown, vehicle_type: vehicleType, color, make_model: makeModel || null, slot: slot || null,
      key_tag: keyTag || null, owner_phone: ownerPhone || null, vip, checks, inside_items: insideRows,
      notes: notes || null, checkin_at: at.toISOString(),
      photos: photos.map((p) => ({ client_id: p.id, side: p.side, item_id: p.item_id, taken_at: p.at.toISOString() })),
    };
    const display = {
      id: 0, client_id: ids.client, ticket_code: ids.ticket, status: "parked", plate: plateShown, vehicle_type: vehicleType,
      color, make_model: makeModel || null, slot: slot.toUpperCase() || null, key_tag: keyTag.toUpperCase() || null, vip,
      notes: notes || null, has_issue: checks.some((c) => !c.checked), owner_phone: ownerPhone || null,
      post: active.post, site: { id: active.site.id, name: active.site.name }, checkin_at: at.toISOString(),
      checkin_by: { id: user.id, name: user.name }, checkout_at: null, checkout_by: null, released_at: null, duration_minutes: 0,
      template_version_id: template!.version_id, template: config, summary_text: summary, incidents: [], photos: [],
      photos_complete: false, checks: exterior.map((it, i) => ({ phase: "in", item_id: it.id, label: it.label, group: it.group, checked: checks[i].checked, note: checks[i].note })),
      inside_items: insides.map((it, i) => ({ phase: "in", item_id: it.id, label: it.label, present: insideRows[i].present, extra_text: insideRows[i].extra_text })),
    };
    try {
      await enqueueCheckin({ userId: user.id, postId: active.post.id, body, photos: photos.map((p) => ({ id: p.id, side: p.side, item_id: p.item_id, blob: p.blob })), display });
      setSavedAt(at);
      setStep(4);
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
    if (step === 3) void save();
    else setStep(step + 1);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  function close() {
    if (step < 4 && (plate || Object.keys(sidePhotos).length) && !window.confirm("Batalkan check in ini? Data yang sudah diisi akan hilang.")) return;
    router.push("/");
  }

  const toggleGroup = (items: TemplateItem[]) =>
    setChecked((c) => ({ ...c, ...Object.fromEntries(items.map((i) => [i.id, true])) }));

  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
      <header className="flex flex-col gap-3.5 bg-ink px-5 pb-4 pt-[max(env(safe-area-inset-top),20px)] text-on-ink">
        <div className="flex items-center gap-3">
          <button onClick={close} aria-label="Tutup" className="flex size-11 items-center justify-center rounded-xl bg-ink-2"><Close /></button>
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-on-ink-muted">Check In · {active.post.name} · langkah {step} dari 4</span>
            <span className="font-display text-xl font-bold">{TITLES[step - 1]}</span>
          </div>
          {step > 1 && plate && <Plate size="sm" accent>{plateShown}</Plate>}
        </div>
        <div aria-hidden="true" className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((n) => <span key={n} className={`h-[5px] rounded-[3px] ${n <= step ? "bg-accent" : "bg-ink-3"}`} />)}
        </div>
      </header>

      <main className="flex flex-1 flex-col [&>*]:shrink-0 gap-[18px] overflow-y-auto px-5 pb-6 pt-[18px]">
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
                  <span className="text-xs text-[#C9CCC6]">Terbaca otomatis · {scan.confidence?.toFixed(2)}</span>
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
                autoCapitalize="characters" autoComplete="off" className={`${field} min-h-14 font-mono text-xl font-bold uppercase`} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Jenis</legend>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => <button key={t} type="button" aria-pressed={vehicleType === t} onClick={() => setVehicleType(t)} className={chip(vehicleType === t)}>{t}</button>)}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Warna</legend>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(([c, hex]) => (
                  <button key={c} type="button" aria-pressed={color === c} onClick={() => setColor(c)} className={chip(color === c)}>
                    <span aria-hidden="true" className="size-4 rounded-full border border-[#9A9F99]" style={{ background: hex }} />{c}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>Merek / model
                <input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="Toyota Fortuner" className={field} />
              </label>
              <label className={label}>Slot parkir
                <input value={slot} onChange={(e) => setSlot(e.target.value.toUpperCase())} placeholder="B2-14" className={`${field} font-mono uppercase`} />
              </label>
            </div>
            <label className={label}>No. gantungan kunci
              <input value={keyTag} onChange={(e) => setKeyTag(e.target.value.toUpperCase())} placeholder="K-027" className={`${field} font-mono uppercase`} />
            </label>
            {/* TODO(decision): nomor WhatsApp pemilik diminta saat check in atau tidak (PRD §14) — default: opsional */}
            <label className={label}>No. WhatsApp pemilik <span className="font-normal text-muted">(opsional)</span>
              <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} inputMode="tel" placeholder="0812 …" className={field} />
            </label>
            <label className="flex min-h-[52px] items-center gap-3 rounded-xl border-[1.5px] border-field bg-surface px-3.5 text-[15px]">
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} className="size-[22px] accent-ink" />
              Tamu VIP
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm leading-normal text-muted">
              {required.length ? `Foto ${required.length} sisi wajib. ` : "Foto sisi opsional untuk lokasi ini. "}
              Kerusakan yang sudah ada difoto close-up sebelum kendaraan diparkir.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {SIDES.map((side) => {
                const shot = sidePhotos[side];
                return (
                  <button key={side} onClick={() => { sideCapture.current = side; sideCam.open(); }} aria-label={`Foto ${SIDE_LABEL[side]}`}
                    className={`tap relative flex min-h-32 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 ${shot ? "border-ink bg-ink text-accent" : "border-dashed border-[#9A9F99] bg-surface text-muted"}`}>
                    <Thumb blob={shot?.blob} alt="" className="opacity-45" />
                    <span className="relative flex flex-col items-center gap-1.5">
                      <CarOutline />
                      <span className="text-[15px] font-semibold">{SIDE_LABEL[side]}{required.includes(side) ? "" : " (opsional)"}</span>
                      <span className="text-xs">{shotLabel(shot)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {sideCam.input}
            {damage.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {damage.map((d) => (
                  <div key={d.id} className="relative h-24 overflow-hidden rounded-xl bg-ink">
                    <Thumb blob={d.blob} alt="Foto kerusakan" />
                    <button onClick={() => setDamage((x) => x.filter((y) => y.id !== d.id))} aria-label="Hapus foto"
                      className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg bg-ink/80 text-on-ink"><Close size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={damageCam.open} className="tap flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[#9A9F99] text-[15px] font-semibold">
              {damageCam.busy ? <Spinner /> : <Plus size={18} />}Foto kerusakan yang sudah ada
            </button>
            {damageCam.input}
            <span className="text-center text-[13px] text-muted">
              {SIDES.filter((s) => sidePhotos[s]).length} dari {required.length || 4} foto{required.length ? " wajib" : ""}
            </span>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm leading-normal text-muted">
              Ketuk untuk ceklis kalau kondisinya baik. Yang tidak diceklis wajib difoto dan diberi catatan.{" "}
              <span className="font-mono font-bold text-ink">{goodCount}/{exterior.length}</span>
            </p>
            {config.groups.filter((g) => g.items.some((i) => i.kind === "exterior")).map((g) => {
              const items = g.items.filter((i) => i.kind === "exterior");
              return (
                <section key={g.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-[17px] font-bold">{g.title}</h2>
                    <button onClick={() => toggleGroup(items)} className="min-h-10 rounded-full border-[1.5px] border-ink bg-surface px-3 text-[13px] font-semibold">Ceklis semua</button>
                  </div>
                  <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
                    {items.map((it, i) => {
                      const on = !!checked[it.id];
                      const needs = !on && it.requires_photo_if_unchecked && config.photo_mode !== "off";
                      return (
                        <div key={it.id} className={i ? "border-t border-line-2" : ""}>
                          <button onClick={() => setChecked((c) => ({ ...c, [it.id]: !on }))} aria-pressed={on}
                            className="flex min-h-14 w-full items-center gap-3.5 px-4 text-left text-base">
                            <Tick on={on} />
                            <span className={`flex-1 ${on ? "font-semibold" : ""}`}>{it.label}</span>
                            {!on && <span className="text-xs text-danger-ink">Perlu dicek</span>}
                          </button>
                          {!on && (
                            <div className="flex flex-col gap-2 px-4 pb-3">
                              <div className="flex gap-2">
                                <button onClick={() => { itemCapture.current = it.id; itemCam.open(); }}
                                  className={`relative flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 ${itemPhotos[it.id] ? "border-ink" : needs ? "border-dashed border-danger text-danger-ink" : "border-dashed border-[#9A9F99] text-muted"}`}
                                  aria-label={`Foto close-up ${it.label}`}>
                                  <Thumb blob={itemPhotos[it.id]?.blob} alt="" />
                                  {!itemPhotos[it.id] && <Camera size={20} />}
                                </button>
                                <input value={itemNotes[it.id] ?? ""} onChange={(e) => setItemNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                                  placeholder={needs ? "Catatan (wajib), mis. lecet kecil" : "Catatan"} aria-label={`Catatan ${it.label}`}
                                  className={`${field} min-h-[52px] text-[15px]`} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {itemCam.input}

            {insides.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-lg font-bold">Barang di dalam</h2>
                <span className="text-[13px] text-muted">Centang yang ada di kendaraan.</span>
                <div className="grid grid-cols-2 gap-2">
                  {insides.map((it) => {
                    const on = !!inside[it.id]?.present;
                    return (
                      <button key={it.id} aria-pressed={on} onClick={() => setInside((s) => ({ ...s, [it.id]: { ...s[it.id], present: !on } }))}
                        className={`flex min-h-[52px] items-center gap-2.5 rounded-xl bg-surface px-3.5 text-left text-[15px] ${on ? "border-2 border-ink font-semibold" : "border-[1.5px] border-field"}`}>
                        <Tick on={on} size={22} />{it.label}
                      </button>
                    );
                  })}
                </div>
                {insides.filter((it) => it.free_text && inside[it.id]?.present).map((it) => (
                  <input key={it.id} value={inside[it.id]?.extra ?? ""} onChange={(e) => setInside((s) => ({ ...s, [it.id]: { present: true, extra: e.target.value } }))}
                    placeholder={`${it.label}: sebutkan barangnya`} aria-label={`${it.label}, sebutkan barangnya`} className={field} />
                ))}
              </section>
            )}

            <label className={label}>Catatan
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="mis. lecet kecil di bamper belakang kiri, sudah ada sebelumnya"
                className="resize-none rounded-xl border-[1.5px] border-field bg-surface px-3.5 py-3 text-[15px] font-normal outline-none focus:border-ink" />
            </label>

            <section aria-label="Ringkasan checklist" className="flex flex-col gap-3 rounded-2xl bg-ink p-4 text-on-ink">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold">Ringkasan otomatis</h2>
                <span className="text-xs text-on-ink-muted">untuk dikirim ke pemilik</span>
              </div>
              <div className="rounded-xl border border-ink-3 bg-ink-2 p-3.5 font-mono text-[13px] leading-[1.75]">
                <div className="font-bold text-accent">{config.summary_title}</div>
                <div>Nomor polisi: {plateShown}</div>
                {summaryRows(config, checked).map((r) => (
                  <div key={r.label}>{r.label}: <span className={r.ok ? "" : "text-danger-soft"}>{r.value}</span></div>
                ))}
                <div>Barang: {insideList(config, inside)}</div>
                <div>Catatan: {notes.trim() || "-"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => navigator.clipboard?.writeText(summary).then(() => setCopied(true))}
                  className="min-h-[46px] rounded-xl border border-ink-line text-sm font-semibold">{copied ? "Tersalin" : "Salin teks"}</button>
                <a href={waLink(summary, ownerPhone)} target="_blank" rel="noreferrer"
                  className="flex min-h-[46px] items-center justify-center rounded-xl bg-accent text-sm font-bold text-ink">Kirim WhatsApp</a>
              </div>
            </section>
          </>
        )}

        {step === 4 && savedAt && (
          <TicketStep code={ids.ticket} plate={plateShown} photoCount={SIDES.filter((s) => sidePhotos[s]).length}
            requiredCount={required.length || 4} good={goodCount} bad={exterior.length - goodCount}
            insideText={insideList(config, inside)} at={savedAt} by={user.name}
            message={ticketMessage({ ticket: ids.ticket, plate: plateShown, site: active.site.name, post: active.post.name, checkinAt: clock(savedAt), summary })}
            ownerPhone={ownerPhone} />
        )}
        <ErrorNote>{error}</ErrorNote>
      </main>

      <footer className="safe-bottom flex gap-2.5 border-t border-line bg-surface px-5 pt-3">
        {step > 1 && step < 4 && (
          <button onClick={() => { setError(null); setStep(step - 1); }} className={btnGhost}>Kembali</button>
        )}
        {step < 4 ? (
          <button onClick={next} disabled={saving} className={`${btnPrimary} flex-1`}>
            {saving && <Spinner />}{step === 3 ? "Simpan check in" : "Lanjut"}
          </button>
        ) : (
          <button onClick={() => router.push("/")} className={`${btnDark} flex-1`}>Selesai, simpan</button>
        )}
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

function TicketStep(p: {
  code: string; plate: string; photoCount: number; requiredCount: number; good: number; bad: number;
  insideText: string; at: Date; by: string; message: string; ownerPhone: string;
}) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(p.code, { margin: 0, width: 288, color: { dark: "#0E100F", light: "#FFFFFF" } }).then(setQr);
  }, [p.code]);
  const rows: [string, React.ReactNode][] = [
    ["Nomor polisi", <span key="p" className="font-mono font-bold">{p.plate}</span>],
    ["Foto", `${p.photoCount} / ${p.requiredCount}`],
    ["Bagian luar", `${p.good} baik · ${p.bad} perlu dicek`],
    ["Barang di dalam", p.insideText],
    ["Waktu masuk", `${clock(p.at)} · oleh ${p.by}`],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-[18px] bg-ink p-5 text-center text-on-ink">
        <span className="text-[13px] text-on-ink-muted">Tiket cek list untuk pemilik</span>
        <div className="size-[168px] rounded-xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={`QR tiket cek list ${p.code}`} className="size-full" />}
        </div>
        <span className="font-mono text-lg font-bold text-accent">{p.code}</span>
      </div>
      <dl className="rounded-[14px] border border-line bg-surface px-4 py-1.5">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex justify-between gap-3 py-2.5 ${i ? "border-t border-line-2" : ""}`}>
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <a href={waLink(p.message, p.ownerPhone)} target="_blank" rel="noreferrer" className={btnGhost + " border-ink text-[15px]"}>
        <WhatsApp size={18} />Kirim tiket cek list via WhatsApp
      </a>
      <p className="text-center text-xs text-muted">Tersimpan di HP dan dikirim otomatis saat ada sinyal.</p>
    </div>
  );
}
