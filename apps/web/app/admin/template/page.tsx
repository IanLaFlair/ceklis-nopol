"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, ApiError, fetcher } from "@/lib/api/client";
import { useQueryParam } from "@/lib/admin/scope";
import type { TemplateFull, TemplateRow } from "@/lib/admin/types";
import { SIDE_LABEL, dateTime } from "@/lib/format";
import { buildSummary, exteriorItems, insideItems } from "@/lib/summary";
import type { ConditionOption, PhotoMode, TemplateConfig, TemplateGroup, TemplateItem } from "@/lib/types";
import { PageHead, btnSm, card, h2, inputSm, useAdmin } from "@/components/admin/shell";
import { ChevronDown, Close } from "@/components/icons";
import { ErrorNote, Spinner } from "@/components/ui";

const SIDES = ["depan", "belakang", "kiri", "kanan"] as const;
const MODES: { id: PhotoMode; label: string }[] = [
  { id: "required_4_sides", label: "Wajib foto sisi" },
  { id: "only_when_unchecked", label: "Hanya bagian yang tidak baik" },
  { id: "off", label: "Mati" },
];

function slug(label: string): string {
  return (
    label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " dan ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 58) || "item"
  );
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export default function TemplatePage() {
  const me = useAdmin();
  const { mutate } = useSWRConfig();
  const { data: list, error } = useSWR<TemplateRow[]>("/admin/templates", fetcher);
  const [idParam, setId] = useQueryParam("id");
  const id = idParam ? Number(idParam) : list?.[0]?.id;
  const manage = me.role === "super_admin" || me.role === "client_admin";
  const [err, setErr] = useState<string | null>(null);

  async function create(path: string, body?: unknown) {
    setErr(null);
    try {
      const t = await api<TemplateFull>(path, { method: "POST", json: body });
      await mutate("/admin/templates");
      setId(String(t.id));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gagal");
    }
  }

  return (
    <>
      <PageHead title="Template Checklist" sub="Atur item yang dicek petugas. Satu template bisa dipakai banyak lokasi.">
        {manage && id && (
          <button onClick={() => create(`/admin/templates/${id}/duplicate`)} className={`${btnSm} border-[1.5px] border-field bg-surface`}>Duplikat</button>
        )}
      </PageHead>
      {(error || err) && <ErrorNote>{error?.message ?? err}</ErrorNote>}
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Daftar template" className={`${card} flex min-w-0 flex-[1_1_220px] flex-col gap-0.5 p-2`}>
          {list?.map((t) => (
            <button key={t.id} onClick={() => setId(String(t.id))} aria-current={t.id === id ? "true" : undefined}
              className={`flex min-h-11 flex-col items-start rounded-[10px] px-3 py-2 text-left text-sm hover:bg-paper ${t.id === id ? "bg-warning-bg" : ""}`}>
              <span className="font-semibold">{t.name}</span>
              <span className="text-xs text-muted-2">
                v{t.version} · {t.client_id == null ? "global" : "klien"} · {t.used_by.length} lokasi
              </span>
            </button>
          ))}
          {manage && (
            <button onClick={() => {
              const name = window.prompt("Nama template baru", "Template baru");
              if (name) void create("/admin/templates", { name });
            }} className="mt-1.5 min-h-11 rounded-[10px] border-[1.5px] border-dashed border-[#9A9F99] text-sm font-semibold">
              + Template baru
            </button>
          )}
        </section>
        <section aria-label="Editor template" className="min-w-0 flex-[3_1_600px]">
          {id ? <Editor key={id} id={id} /> : <p className="p-8 text-center text-muted">Belum ada template.</p>}
        </section>
      </div>
    </>
  );
}

function Editor({ id }: { id: number }) {
  const me = useAdmin();
  const { mutate } = useSWRConfig();
  const key = `/admin/templates/${id}`;
  const { data: tpl, error } = useSWR<TemplateFull>(key, fetcher);
  const [cfg, setCfg] = useState<TemplateConfig | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Jenis item untuk grup yang masih kosong (grup berisi mengikuti item pertamanya)
  const [kinds, setKinds] = useState<Record<string, TemplateItem["kind"]>>({});

  useEffect(() => {
    if (tpl && !cfg) {
      setCfg(structuredClone(tpl.config));
      setName(tpl.name);
    }
  }, [tpl, cfg]);

  const readOnly = !tpl || !(me.role === "super_admin" || (me.role === "client_admin" && tpl.client_id === me.client_id));
  const dirty = !!tpl && !!cfg && (JSON.stringify(cfg) !== JSON.stringify(tpl.config) || name !== tpl.name);
  const taken = useMemo(() => new Set(cfg?.groups.flatMap((g) => g.items.map((i) => i.id)) ?? []), [cfg]);

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!tpl || !cfg) return <div className="flex justify-center p-10 text-muted"><Spinner /></div>;

  const update = (fn: (c: TemplateConfig) => TemplateConfig) => setCfg((c) => (c ? fn(structuredClone(c)) : c));
  const setGroups = (fn: (g: TemplateGroup[]) => TemplateGroup[]) => update((c) => ({ ...c, groups: fn(c.groups) }));
  const setItem = (gi: number, ii: number, patch: Partial<TemplateItem>) =>
    setGroups((gs) => gs.map((g, x) => (x !== gi ? g : { ...g, items: g.items.map((it, y) => (y === ii ? { ...it, ...patch } : it)) })));

  function addItem(gi: number) {
    const label = (draft[gi] ?? "").trim();
    if (!label) return;
    const g = cfg!.groups[gi];
    const kind = g.items[0]?.kind ?? kinds[g.id] ?? "exterior";
    const item: TemplateItem = {
      id: uniqueId(slug(label), taken), label, kind,
      requires_photo_if_unchecked: kind === "exterior", free_text: false,
    };
    setGroups((gs) => gs.map((x, n) => (n === gi ? { ...x, items: [...x.items, item] } : x)));
    setDraft((d) => ({ ...d, [gi]: "" }));
  }

  function removeItem(gi: number, ii: number) {
    const itemId = cfg!.groups[gi].items[ii].id;
    update((c) => ({
      ...c,
      groups: c.groups.map((g, x) => (x === gi ? { ...g, items: g.items.filter((_, y) => y !== ii) } : g)),
      // Item yang dihapus juga keluar dari pemetaan ringkasan; baris kosong dibuang
      summary_lines: c.summary_lines.map((l) => ({ ...l, item_ids: l.item_ids.filter((i) => i !== itemId) })).filter((l) => l.item_ids.length),
    }));
  }

  function addGroup(kind: "exterior" | "inside_item") {
    const title = window.prompt("Nama grup", kind === "exterior" ? "Grup baru" : "Bagian dalam");
    if (!title) return;
    const gids = new Set(cfg!.groups.map((g) => g.id));
    const gid = uniqueId(slug(title), gids);
    setKinds((k) => ({ ...k, [gid]: kind }));
    setGroups((gs) => [...gs, { id: gid, title, items: [] }]);
  }

  async function saveAll() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<TemplateFull>(key, { method: "PUT", json: { name, config: cfg } });
      await mutate(key, r, { revalidate: false });
      await mutate("/admin/templates");
      setCfg(structuredClone(r.config));
      setName(r.name);
      setMsg({ ok: true, text: `Tersimpan sebagai versi ${r.version}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  const exterior = exteriorItems(cfg);
  const preview = buildSummary(
    cfg, "B 1234 ABC",
    Object.fromEntries(exterior.map((i, n) => [i.id, n !== 2])),
    Object.fromEntries(insideItems(cfg).slice(0, 1).map((i) => [i.id, { present: true }])),
    "",
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${card} flex flex-wrap items-end gap-3 p-[18px]`}>
        <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-sm font-semibold">
          Nama template
          <input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} className={inputSm} />
        </label>
        <span className="text-sm text-muted">Versi {tpl.version} · {dateTime(tpl.updated_at)}</span>
        {!readOnly && (
          <button onClick={saveAll} disabled={busy || !dirty} className={`${btnSm} bg-ink font-bold text-on-ink`}>
            {busy && <Spinner />}Simpan perubahan
          </button>
        )}
      </div>
      {readOnly && (
        <p className="rounded-xl bg-warning-bg px-3.5 py-3 text-sm text-warning">
          Template global hanya bisa diubah super admin. Pakai tombol <strong>Duplikat</strong> untuk membuat versi klien kamu.
        </p>
      )}
      {msg && (
        <p role="status" className={`rounded-xl px-3.5 py-3 text-sm ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger-ink"}`}>{msg.text}</p>
      )}

      <fieldset disabled={readOnly} className="flex flex-col gap-3.5">
        <ConditionsEditor conditions={cfg.conditions ?? []} onChange={(conditions) => update((c) => ({ ...c, conditions }))} />

        <section className={`${card} flex flex-col gap-3 px-5 py-[18px]`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={h2}>Foto wajib</h2>
            <span className="text-[13px] text-muted">Diambil saat check in &amp; check out</span>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold sm:max-w-[320px]">
            Mode foto
            <select value={cfg.photo_mode} onChange={(e) => update((c) => ({ ...c, photo_mode: e.target.value as PhotoMode }))} className={inputSm}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          {cfg.photo_mode === "required_4_sides" && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sisi wajib">
              {SIDES.map((s) => {
                const on = cfg.required_sides.includes(s);
                return (
                  <button key={s} type="button" aria-pressed={on}
                    onClick={() => update((c) => ({ ...c, required_sides: on ? c.required_sides.filter((x) => x !== s) : SIDES.filter((x) => x === s || c.required_sides.includes(x)) }))}
                    className={`min-h-11 rounded-full border-[1.5px] px-4 text-sm ${on ? "border-ink bg-ink font-semibold text-on-ink" : "border-field bg-surface"}`}>
                    {SIDE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          )}
          <span className="text-xs text-muted">
            {cfg.photo_mode === "off" ? "Foto sisi & close-up tidak diwajibkan. Foto barang di dalam tetap mengikuti tanda “wajib foto kalau ada”." : "Bagian yang tidak baik dan bertanda “wajib foto” butuh foto close-up."}
          </span>
        </section>

        {cfg.groups.map((g, gi) => {
          const kind = g.items[0]?.kind ?? kinds[g.id] ?? "exterior";
          return (
            <section key={g.id} className={`${card} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-[#E6E6E0] px-5 py-3">
                <input aria-label="Nama grup" value={g.title}
                  onChange={(e) => setGroups((gs) => gs.map((x, n) => (n === gi ? { ...x, title: e.target.value } : x)))}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-transparent px-2 font-display text-[17px] font-bold outline-none hover:border-line focus:border-ink" />
                <span className="text-xs text-muted-2">{kind === "exterior" ? "Bagian luar · Baik / Perlu dicek" : "Barang di dalam · ada / tidak"}</span>
                <OrderButtons onUp={() => setGroups((gs) => move(gs, gi, -1))} onDown={() => setGroups((gs) => move(gs, gi, 1))} label={g.title} />
                <button type="button" aria-label={`Hapus grup ${g.title}`} onClick={() => {
                  if (window.confirm(`Hapus grup ${g.title} beserta ${g.items.length} item?`)) {
                    update((c) => {
                      const ids = new Set(c.groups[gi].items.map((i) => i.id));
                      return {
                        ...c,
                        groups: c.groups.filter((_, n) => n !== gi),
                        summary_lines: c.summary_lines.map((l) => ({ ...l, item_ids: l.item_ids.filter((i) => !ids.has(i)) })).filter((l) => l.item_ids.length),
                      };
                    });
                  }
                }} className="flex size-10 items-center justify-center rounded-lg text-muted-2 hover:bg-paper"><Close size={18} /></button>
              </div>
              {g.items.map((it, ii) => (
                <div key={it.id} className="flex flex-wrap items-center gap-3 border-t border-line-2 px-5 py-2 first:border-t-0">
                  <input aria-label="Label item" value={it.label} onChange={(e) => setItem(gi, ii, { label: e.target.value })}
                    className="min-h-10 min-w-[160px] flex-1 rounded-lg border border-transparent px-2 text-[15px] outline-none hover:border-line focus:border-ink" />
                  <span className="font-mono text-[11px] text-muted-2">{it.id}</span>
                  {it.kind === "exterior" ? (
                    <label className="flex min-h-10 items-center gap-2 text-[13px] text-muted">
                      <input type="checkbox" checked={it.requires_photo_if_unchecked}
                        onChange={(e) => setItem(gi, ii, { requires_photo_if_unchecked: e.target.checked })} className="size-[18px] accent-ink" />
                      Wajib foto kalau penyok / lecet
                    </label>
                  ) : (
                    <>
                      <label className="flex min-h-10 items-center gap-2 text-[13px] text-muted">
                        <input type="checkbox" checked={!!it.requires_photo_if_present}
                          onChange={(e) => setItem(gi, ii, { requires_photo_if_present: e.target.checked })} className="size-[18px] accent-ink" />
                        Wajib foto kalau ada
                      </label>
                      <label className="flex min-h-10 items-center gap-2 text-[13px] text-muted">
                        <input type="checkbox" checked={it.free_text} onChange={(e) => setItem(gi, ii, { free_text: e.target.checked })} className="size-[18px] accent-ink" />
                        Isi teks bebas
                      </label>
                    </>
                  )}
                  <OrderButtons label={it.label}
                    onUp={() => setGroups((gs) => gs.map((x, n) => (n === gi ? { ...x, items: move(x.items, ii, -1) } : x)))}
                    onDown={() => setGroups((gs) => gs.map((x, n) => (n === gi ? { ...x, items: move(x.items, ii, 1) } : x)))} />
                  <button type="button" onClick={() => removeItem(gi, ii)} aria-label={`Hapus ${it.label}`}
                    className="flex size-10 items-center justify-center rounded-lg text-lg text-muted-2 hover:bg-paper">×</button>
                </div>
              ))}
              {!readOnly && (
                <form onSubmit={(e) => { e.preventDefault(); addItem(gi); }} className="flex gap-2 border-t border-line-2 bg-[#FAFAF7] px-5 py-3">
                  <input aria-label={`Item baru di ${g.title}`} value={draft[gi] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [gi]: e.target.value }))}
                    placeholder={kind === "exterior" ? "Tambah item, mis. Spion kiri" : "Tambah barang, mis. Dompet"} className={`${inputSm} flex-1`} />
                  <button className={`${btnSm} bg-accent font-bold text-ink`}>Tambah</button>
                </form>
              )}
              {g.items.length === 0 && readOnly && <p className="px-5 py-3 text-sm text-muted">Grup kosong.</p>}
              {g.items.length === 0 && !readOnly && (
                <label className="flex items-center gap-2 px-5 pb-3 text-sm text-muted">
                  Jenis item grup ini
                  <select value={kind} onChange={(e) => setKinds((k) => ({ ...k, [g.id]: e.target.value as TemplateItem["kind"] }))}
                    className="min-h-10 rounded-lg border-[1.5px] border-field bg-surface px-2 text-base sm:text-sm">
                    <option value="exterior">Bagian luar (Baik / Perlu dicek)</option>
                    <option value="inside_item">Barang di dalam (ada / tidak)</option>
                  </select>
                </label>
              )}
            </section>
          );
        })}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addGroup("exterior")} className={`${btnSm} border-[1.5px] border-dashed border-[#9A9F99]`}>+ Grup bagian luar</button>
            <button type="button" onClick={() => addGroup("inside_item")} className={`${btnSm} border-[1.5px] border-dashed border-[#9A9F99]`}>+ Grup barang di dalam</button>
          </div>
        )}

        <section className={`${card} flex flex-col gap-3 p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>Pemetaan ringkasan</h2>
            <span className="text-[13px] text-muted">Format teks yang dikirim ke pemilik</span>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold sm:max-w-[320px]">
            Judul ringkasan
            <input value={cfg.summary_title} onChange={(e) => update((c) => ({ ...c, summary_title: e.target.value }))} className={inputSm} />
          </label>
          {cfg.summary_lines.map((l, li) => (
            <SummaryLineRow key={li} label={l.label} ids={l.item_ids} items={exterior}
              onLabel={(v) => update((c) => ({ ...c, summary_lines: c.summary_lines.map((x, n) => (n === li ? { ...x, label: v } : x)) }))}
              onIds={(ids) => update((c) => ({ ...c, summary_lines: c.summary_lines.map((x, n) => (n === li ? { ...x, item_ids: ids } : x)) }))}
              onUp={() => update((c) => ({ ...c, summary_lines: move(c.summary_lines, li, -1) }))}
              onDown={() => update((c) => ({ ...c, summary_lines: move(c.summary_lines, li, 1) }))}
              onRemove={() => update((c) => ({ ...c, summary_lines: c.summary_lines.filter((_, n) => n !== li) }))} />
          ))}
          {!readOnly && (
            <button type="button" disabled={!exterior.length}
              onClick={() => update((c) => ({ ...c, summary_lines: [...c.summary_lines, { label: "Baris baru", item_ids: [exterior[0].id] }] }))}
              className={`${btnSm} self-start border-[1.5px] border-dashed border-[#9A9F99]`}>+ Baris ringkasan</button>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Pratinjau (contoh: item ke-3 tidak diceklis)</span>
            <pre className="overflow-x-auto rounded-xl bg-ink p-3.5 font-mono text-[13px] leading-[1.75] whitespace-pre-wrap text-on-ink">{preview}</pre>
          </div>
        </section>
      </fieldset>

      <div className="flex flex-wrap gap-3.5">
        <section className="flex min-w-0 flex-[1.4_1_320px] flex-col gap-2.5 rounded-[14px] bg-ink px-5 py-[18px] text-on-ink">
          <h2 className={h2}>Dipakai di</h2>
          <div className="flex flex-wrap gap-2">
            {tpl.used_by.map((u) => (
              <span key={u.id} className="inline-flex min-h-9 items-center rounded-full border border-ink-line bg-[#1E2220] px-3 text-[13px]">{u.name}</span>
            ))}
            {!tpl.used_by.length && <span className="text-sm text-on-ink-muted">Belum dipakai lokasi mana pun.</span>}
          </div>
          <span className="text-xs text-on-ink-muted">
            Perubahan berlaku untuk check in berikutnya. Transaksi yang sudah berjalan tetap memakai versi lama.
          </span>
        </section>
        <section className={`${card} flex min-w-0 flex-[1_1_240px] flex-col gap-2 p-[18px]`}>
          <h2 className={h2}>Riwayat versi</h2>
          {tpl.versions.map((v) => (
            <div key={v.id} className="flex justify-between gap-2 text-sm">
              <span className="font-mono font-semibold">v{v.version}</span>
              <span className="text-muted">{dateTime(v.created_at)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function OrderButtons({ onUp, onDown, label }: { onUp: () => void; onDown: () => void; label: string }) {
  return (
    <span className="flex">
      <button type="button" onClick={onUp} aria-label={`Naikkan ${label}`} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-paper">
        <ChevronDown size={18} className="rotate-180" />
      </button>
      <button type="button" onClick={onDown} aria-label={`Turunkan ${label}`} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-paper">
        <ChevronDown size={18} />
      </button>
    </span>
  );
}

function SummaryLineRow({ label, ids, items, onLabel, onIds, onUp, onDown, onRemove }: {
  label: string;
  ids: string[];
  items: { id: string; label: string; group: string }[];
  onLabel: (v: string) => void;
  onIds: (ids: string[]) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const names = ids.map((i) => items.find((x) => x.id === i)?.label ?? i);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Label baris" value={label} onChange={(e) => onLabel(e.target.value)} className={`${inputSm} min-w-[160px] flex-1`} />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="min-h-11 rounded-[10px] border-[1.5px] border-field px-3 text-left text-sm">
          ← {names.join(", ") || "pilih item"}
        </button>
        <OrderButtons onUp={onUp} onDown={onDown} label={label} />
        <button type="button" onClick={onRemove} aria-label={`Hapus baris ${label}`} className="flex size-10 items-center justify-center rounded-lg text-lg text-muted-2 hover:bg-paper">×</button>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {items.map((it) => (
            <label key={it.id} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={ids.includes(it.id)} className="size-[18px] accent-ink"
                onChange={(e) => onIds(e.target.checked ? [...ids, it.id] : ids.filter((x) => x !== it.id))} />
              {it.label} <span className="text-xs text-muted-2">{it.group}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


const DEFAULT_CONDITIONS: ConditionOption[] = [
  { id: "mulus", label: "Mulus", ok: true },
  { id: "penyok", label: "Penyok", ok: false },
  { id: "lecet", label: "Lecet", ok: false },
];

/** Pilihan kondisi tiap bagian luar (mis. Mulus / Penyok / Lecet). Id lama tidak pernah diubah. */
function ConditionsEditor({ conditions, onChange }: { conditions: ConditionOption[]; onChange: (c: ConditionOption[]) => void }) {
  const [draft, setDraft] = useState("");
  const set = (i: number, patch: Partial<ConditionOption>) => onChange(conditions.map((c, x) => (x === i ? { ...c, ...patch } : c)));
  function add() {
    const label = draft.trim();
    if (!label) return;
    const id = uniqueId(slug(label).slice(0, 28), new Set(conditions.map((c) => c.id)));
    onChange([...conditions, { id, label, ok: false }]);
    setDraft("");
  }
  return (
    <section className={`${card} flex flex-col gap-3 px-5 py-[18px]`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={h2}>Pilihan kondisi</h2>
        <span className="text-[13px] text-muted">Petugas wajib memilih salah satu untuk tiap bagian luar</span>
      </div>
      {conditions.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-paper-2 px-3.5 py-3 text-sm text-muted">
          Template ini masih memakai centang baik / tidak.
          <button type="button" onClick={() => onChange(DEFAULT_CONDITIONS)} className={btnSm}>Pakai Mulus / Penyok / Lecet</button>
        </div>
      ) : (
        <div className="flex flex-col">
          {conditions.map((c, i) => (
            <div key={c.id} className={`flex flex-wrap items-center gap-3 py-2 ${i ? "border-t border-line-2" : ""}`}>
              <input value={c.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Label kondisi ${c.label}`}
                className="min-h-10 min-w-[140px] flex-1 rounded-lg border border-transparent px-2 text-[15px] outline-none hover:border-line focus:border-ink" />
              <span className="font-mono text-[11px] text-muted-2">{c.id}</span>
              <label className="flex min-h-10 items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" checked={c.ok} onChange={(e) => set(i, { ok: e.target.checked })} className="size-[18px] accent-ink" />
                Dihitung baik
              </label>
              <OrderButtons label={c.label} onUp={() => onChange(move(conditions, i, -1))} onDown={() => onChange(move(conditions, i, 1))} />
              <button type="button" onClick={() => onChange(conditions.filter((_, x) => x !== i))} disabled={conditions.length <= 2}
                aria-label={`Hapus ${c.label}`} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-paper-2 disabled:opacity-30">
                <Close size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      {conditions.length > 0 && (
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="Tambah kondisi, mis. Retak" aria-label="Kondisi baru" className={`${inputSm} flex-1`} />
          <button type="button" onClick={add} className={btnSm}>Tambah</button>
        </div>
      )}
      {conditions.length > 0 && !conditions.some((c) => c.ok) && (
        <p className="text-xs text-danger-ink">Minimal satu kondisi harus “dihitung baik”.</p>
      )}
    </section>
  );
}
