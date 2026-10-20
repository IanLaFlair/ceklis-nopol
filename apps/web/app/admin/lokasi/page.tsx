"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, ApiError, fetcher } from "@/lib/api/client";
import { canManage } from "@/lib/admin/actions";
import { useQueryParam } from "@/lib/admin/scope";
import type { AdminUserRow, AssignmentOut, SiteOut, SiteOverview, TemplateRow } from "@/lib/admin/types";
import { ROLE_LABEL, dateTime } from "@/lib/format";
import { Dialog, Field } from "@/components/admin/dialog";
import { PageHead, btnSm, card, h2, inputSm, useAdmin } from "@/components/admin/shell";
import { Pin, Search } from "@/components/icons";
import { Badge, ErrorNote, Spinner } from "@/components/ui";

type Modal =
  | { kind: "site"; site?: SiteOut }
  | { kind: "client" }
  | { kind: "post" }
  | { kind: "invite" }
  | { kind: "assignment"; a: AssignmentOut }
  | { kind: "pin"; name: string; pin: string; phone: string | null };

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : "Gagal menyimpan";
}

export default function LokasiPage() {
  const me = useAdmin();
  const manage = canManage(me.role);
  const { data: clients } = useSWR<{ id: number; name: string }[]>("/admin/clients", fetcher);
  const { data: sites, error } = useSWR<SiteOut[]>("/admin/sites", fetcher);
  const [siteParam, setSite] = useQueryParam("site");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const siteId = siteParam ? Number(siteParam) : sites?.[0]?.id;

  const groups = (clients ?? [])
    .map((c) => ({ ...c, sites: (sites ?? []).filter((s) => s.client_id === c.id && (!q || s.name.toLowerCase().includes(q.toLowerCase()))) }))
    .filter((c) => c.sites.length || (!q && manage));

  return (
    <>
      <PageHead title="Lokasi & Petugas" sub="Klien → lokasi → pos (lobby). Petugas ditugaskan per pos.">
        {manage && (
          <>
            {me.role === "super_admin" && (
              <button onClick={() => setModal({ kind: "client" })} className={`${btnSm} border-[1.5px] border-field bg-surface`}>Tambah klien</button>
            )}
            <button onClick={() => setModal({ kind: "site" })} className={`${btnSm} bg-accent font-bold text-ink`}>Tambah lokasi</button>
          </>
        )}
      </PageHead>
      {error && <ErrorNote>{error.message}</ErrorNote>}

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Struktur lokasi" className={`${card} min-w-0 flex-[1_1_260px] p-2.5`}>
          <label className="m-1 mb-2.5 flex min-h-10 items-center gap-2 rounded-lg border border-line px-2.5 text-sm text-muted">
            <Search size={15} />
            <span className="sr-only">Cari lokasi</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari lokasi"
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none sm:text-sm" />
          </label>
          {groups.map((c) => (
            <div key={c.id}>
              <div className="px-2.5 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-2 uppercase">{c.name}</div>
              {c.sites.map((s) => (
                <button key={s.id} onClick={() => setSite(String(s.id))} aria-current={s.id === siteId ? "true" : undefined}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-paper ${s.id === siteId ? "bg-warning-bg font-semibold" : ""}`}>
                  <Pin size={16} />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-muted-2">{s.posts.length} pos</span>
                </button>
              ))}
              {!c.sites.length && <p className="px-2.5 py-1 text-xs text-muted">Belum ada lokasi.</p>}
            </div>
          ))}
          {sites && !groups.length && <p className="p-3 text-sm text-muted">Tidak ada lokasi.</p>}
        </section>

        <section aria-label="Detail lokasi" className="min-w-0 flex-[2.4_1_600px]">
          {siteId ? (
            <SiteDetail id={siteId} manage={manage} open={setModal} />
          ) : (
            <p className="p-8 text-center text-muted">{sites ? "Belum ada lokasi. Tambahkan lokasi pertama." : ""}</p>
          )}
        </section>
      </div>

      {modal?.kind === "client" && <ClientDialog onClose={() => setModal(null)} />}
      {modal?.kind === "site" && (
        <SiteDialog site={modal.site} clients={clients ?? []} onClose={() => setModal(null)}
          onSaved={(s) => { setModal(null); setSite(String(s.id)); }} />
      )}
      {modal?.kind === "post" && siteId && <PostDialog siteId={siteId} onClose={() => setModal(null)} />}
      {modal?.kind === "invite" && siteId && (
        <InviteDialog siteId={siteId} onClose={() => setModal(null)}
          onPin={(name, pin, phone) => setModal({ kind: "pin", name, pin, phone })} />
      )}
      {modal?.kind === "assignment" && siteId && <AssignmentDialog a={modal.a} siteId={siteId} onClose={() => setModal(null)} />}
      {modal?.kind === "pin" && <PinDialog {...modal} onClose={() => setModal(null)} />}
    </>
  );
}

function SiteDetail({ id, manage, open }: { id: number; manage: boolean; open: (m: Modal) => void }) {
  const { mutate } = useSWRConfig();
  const key = `/admin/sites/${id}/overview`;
  const { data, error } = useSWR<SiteOverview>(key, fetcher, { refreshInterval: 15000 });
  const [msg, setMsg] = useState<string | null>(null);

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return <div className="flex justify-center p-10 text-muted"><Spinner /></div>;
  const { site } = data;

  async function run(fn: () => Promise<unknown>) {
    setMsg(null);
    try {
      await fn();
      await mutate(key);
      await mutate("/admin/sites");
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3.5 rounded-[14px] bg-ink p-5 text-on-ink">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-on-ink-muted">{site.client.name}</span>
          <strong className="font-display text-2xl">{site.name}</strong>
          <span className="text-[13px] text-on-ink-muted">
            {site.address || "Alamat belum diisi"} · template: {site.template?.name ?? "belum dipilih"}
          </span>
        </div>
        {manage && (
          <div className="flex gap-2">
            <button onClick={() => open({ kind: "site", site })} className="min-h-11 rounded-[10px] border border-ink-line px-3.5 text-sm">Ubah</button>
            <button onClick={() => open({ kind: "post" })} className="min-h-11 rounded-[10px] bg-accent px-3.5 text-sm font-bold text-ink">+ Tambah pos</button>
          </div>
        )}
      </div>
      {!site.template && <ErrorNote>Lokasi ini belum punya template checklist — petugas tidak bisa check in. Pilih template lewat tombol Ubah.</ErrorNote>}
      {msg && <ErrorNote>{msg}</ErrorNote>}

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-[#E6E6E0] px-5 py-4">
          <h2 className={h2}>Pos valet <span className="font-medium text-muted-2">{data.posts.length}</span></h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.05em] text-muted uppercase">
                <th className="px-5 py-2.5 font-medium">Pos</th>
                <th className="px-3 py-2.5 font-medium">Petugas</th>
                <th className="px-3 py-2.5 font-medium">Supervisor</th>
                <th className="px-3 py-2.5 text-right font-medium">Masih parkir</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={p.id} className="border-t border-line-2 hover:bg-paper-2">
                  <td className="px-5 py-3 font-semibold">{p.name}</td>
                  <td className="px-3 py-3">{p.staff.join(", ") || "-"}</td>
                  <td className="px-3 py-3">{p.supervisors.join(", ") || "-"}</td>
                  <td className="px-3 py-3 text-right font-mono">{p.parked}</td>
                  <td className="px-5 py-3">
                    {manage ? (
                      <button onClick={() => run(() => api(`/admin/posts/${p.id}`, { method: "PATCH", json: { active: !p.active } }))}
                        aria-label={`${p.active ? "Nonaktifkan" : "Aktifkan"} ${p.name}`} className="flex min-h-11 items-center gap-2">
                        <Badge tone={p.active ? "released" : "local"}>{p.active ? "Aktif" : "Nonaktif"}</Badge>
                        <span className="text-xs text-muted underline">{p.active ? "nonaktifkan" : "aktifkan"}</span>
                      </button>
                    ) : (
                      <Badge tone={p.active ? "released" : "local"}>{p.active ? "Aktif" : "Nonaktif"}</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {!data.posts.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">Belum ada pos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E6E0] px-5 py-4">
          <h2 className={h2}>Petugas di lokasi ini</h2>
          {manage && (
            <button onClick={() => open({ kind: "invite" })} className={`${btnSm} border-[1.5px] border-ink bg-surface`}>Undang petugas</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.05em] text-muted uppercase">
                <th className="px-5 py-2.5 font-medium">Nama</th>
                <th className="px-3 py-2.5 font-medium">Peran</th>
                <th className="px-3 py-2.5 font-medium">Pos</th>
                <th className="px-3 py-2.5 text-right font-medium">Pemeriksaan hari ini</th>
                <th className="px-3 py-2.5 font-medium">Terakhir aktif</th>
                {manage && <th className="px-5 py-2.5 font-medium">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {data.staff.map((st) => (
                <tr key={st.user.id} className={`border-t border-line-2 align-top hover:bg-paper-2 ${st.active ? "" : "opacity-60"}`}>
                  <td className="px-5 py-3">
                    <span className="font-semibold">{st.user.name}</span>
                    <span className="block text-xs text-muted">{st.user.staff_code ?? ""}{st.user.phone ? ` · ${st.user.phone}` : ""}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${st.role === "supervisor" ? "bg-ink text-on-ink" : "bg-paper-2 text-ink"}`}>
                      {ROLE_LABEL[st.role]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {st.assignments.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center gap-1.5">
                        <span>{a.post_name}{a.role_on_post === "supervisor" ? " (spv)" : ""}</span>
                        {a.shift && <span className="text-xs text-muted">{a.shift}</span>}
                        {manage && (
                          <button onClick={() => open({ kind: "assignment", a })} className="min-h-8 text-xs underline">ubah</button>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{st.checks_today}</td>
                  <td className="px-3 py-3 text-muted">{st.last_active_at ? dateTime(st.last_active_at) : "belum pernah"}</td>
                  {manage && (
                    <td className="px-5 py-2">
                      <div className="flex flex-col items-start">
                        {(st.role === "petugas" || st.role === "supervisor") && (
                          <button className="min-h-9 text-xs underline"
                            onClick={() => run(async () => {
                              const r = await api<{ pin: string }>(`/admin/users/${st.user.id}`, { method: "PATCH", json: { reset_pin: true } });
                              open({ kind: "pin", name: st.user.name, pin: r.pin, phone: st.user.phone });
                            })}>
                            Reset PIN
                          </button>
                        )}
                        <button className="min-h-9 text-xs text-danger-ink underline"
                          onClick={() => {
                            if (window.confirm(`${st.active ? "Nonaktifkan" : "Aktifkan"} ${st.user.name}?`)) {
                              void run(() => api(`/admin/users/${st.user.id}`, { method: "PATCH", json: { active: !st.active } }));
                            }
                          }}>
                          {st.active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!data.staff.length && <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">Belum ada petugas ditugaskan.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function useSave(after: () => Promise<unknown> | void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      await after();
      return r;
    } catch (e) {
      setErr(errMsg(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, err, save };
}

function Actions({ busy, onClose, label = "Simpan" }: { busy: boolean; onClose: () => void; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onClose} className={`${btnSm} border-[1.5px] border-field bg-surface`}>Batal</button>
      <button disabled={busy} className={`${btnSm} bg-ink text-on-ink`}>{busy && <Spinner />}{label}</button>
    </div>
  );
}

function ClientDialog({ onClose }: { onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const { busy, err, save } = useSave(() => mutate("/admin/clients"));
  return (
    <Dialog title="Tambah klien" onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        if (await save(() => api("/admin/clients", { method: "POST", json: { name } }))) onClose();
      }}>
        <Field label="Nama klien"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Pakuwon Group" className={inputSm} /></Field>
        <ErrorNote>{err}</ErrorNote>
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Dialog>
  );
}

function SiteDialog({ site, clients, onClose, onSaved }: {
  site?: SiteOut;
  clients: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (s: SiteOut) => void;
}) {
  const { mutate } = useSWRConfig();
  const { data: templates } = useSWR<TemplateRow[]>("/admin/templates", fetcher);
  const [clientId, setClientId] = useState(site?.client_id ?? clients[0]?.id ?? 0);
  const [name, setName] = useState(site?.name ?? "");
  const [address, setAddress] = useState(site?.address ?? "");
  const [templateId, setTemplateId] = useState<number | "">(site?.template_id ?? "");
  const { busy, err, save } = useSave(() => mutate((k) => typeof k === "string" && k.startsWith("/admin/sites")));
  const tplOptions = (templates ?? []).filter((t) => t.client_id == null || t.client_id === clientId);

  return (
    <Dialog title={site ? "Ubah lokasi" : "Tambah lokasi"} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        const body = { name, address: address || null, template_id: templateId === "" ? null : templateId };
        const r = await save(() => site
          ? api<SiteOut>(`/admin/sites/${site.id}`, { method: "PATCH", json: body })
          : api<SiteOut>("/admin/sites", { method: "POST", json: { ...body, client_id: clientId } }));
        if (r) onSaved(r as SiteOut);
      }}>
        {!site && (
          <Field label="Klien">
            <select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} className={inputSm}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nama lokasi"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Pakuwon Mall Surabaya" className={inputSm} /></Field>
        <Field label="Alamat"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputSm} /></Field>
        <Field label="Template checklist" hint="Pos di lokasi ini mewarisi template lokasi.">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")} className={inputSm}>
            <option value="">— belum dipilih —</option>
            {tplOptions.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
          </select>
        </Field>
        <ErrorNote>{err}</ErrorNote>
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Dialog>
  );
}

function PostDialog({ siteId, onClose }: { siteId: number; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const { busy, err, save } = useSave(async () => {
    await mutate(`/admin/sites/${siteId}/overview`);
    await mutate("/admin/sites");
    await mutate("/admin/scope-tree");
  });
  return (
    <Dialog title="Tambah pos" onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        if (await save(() => api("/admin/posts", { method: "POST", json: { site_id: siteId, name } }))) onClose();
      }}>
        <Field label="Nama pos"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Lobby 7" className={inputSm} /></Field>
        <ErrorNote>{err}</ErrorNote>
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Dialog>
  );
}

function ShiftFields({ v, set }: {
  v: { shift_name: string; shift_start: string; shift_end: string };
  set: (k: "shift_name" | "shift_start" | "shift_end", val: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <Field label="Shift"><input value={v.shift_name} onChange={(e) => set("shift_name", e.target.value)} placeholder="Shift pagi" className={inputSm} /></Field>
      <Field label="Mulai"><input type="time" value={v.shift_start} onChange={(e) => set("shift_start", e.target.value)} className={inputSm} /></Field>
      <Field label="Selesai"><input type="time" value={v.shift_end} onChange={(e) => set("shift_end", e.target.value)} className={inputSm} /></Field>
    </div>
  );
}

function InviteDialog({ siteId, onClose, onPin }: {
  siteId: number;
  onClose: () => void;
  onPin: (name: string, pin: string, phone: string | null) => void;
}) {
  const { mutate } = useSWRConfig();
  const { data: ov } = useSWR<SiteOverview>(`/admin/sites/${siteId}/overview`, fetcher);
  const { data: users } = useSWR<AdminUserRow[]>("/admin/users", fetcher);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [userId, setUserId] = useState<number | "">("");
  const [f, setF] = useState({ name: "", phone: "", role: "petugas", post_id: 0, shift_name: "Shift pagi", shift_start: "07:00", shift_end: "15:00" });
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const postId = f.post_id || ov?.posts[0]?.id || 0;
  const { busy, err, save } = useSave(() => mutate(`/admin/sites/${siteId}/overview`));
  const candidates = (users ?? []).filter((u) => u.active && (u.role === "petugas" || u.role === "supervisor"));
  const existing = candidates.find((u) => u.id === userId);

  return (
    <Dialog title="Undang petugas" onClose={onClose} wide>
      <div role="group" aria-label="Jenis" className="flex gap-2">
        {(["new", "existing"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={`min-h-11 rounded-full border-[1.5px] px-4 text-sm ${mode === m ? "border-ink bg-ink font-semibold text-on-ink" : "border-field"}`}>
            {m === "new" ? "Petugas baru" : "Sudah terdaftar"}
          </button>
        ))}
      </div>
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        const r = await save(async () => {
          let uid: number;
          let role: string;
          let pin: string | null = null;
          let phone: string | null = null;
          let name: string;
          if (mode === "new") {
            const u = await api<{ id: number; pin: string | null; phone: string | null; name: string; role: string }>(
              "/admin/users", { method: "POST", json: { name: f.name, phone: f.phone, role: f.role, client_id: ov?.site.client_id } });
            uid = u.id; pin = u.pin; phone = u.phone; name = u.name; role = u.role;
          } else {
            if (!existing) throw new ApiError(422, "Pilih petugas");
            uid = existing.id; name = existing.name; role = existing.role;
          }
          await api("/admin/assignments", {
            method: "POST",
            json: {
              user_id: uid, post_id: postId, role_on_post: role === "supervisor" ? "supervisor" : "petugas",
              shift_name: f.shift_name || null, shift_start: f.shift_start || null, shift_end: f.shift_end || null,
            },
          });
          return { name, pin, phone };
        });
        if (r) {
          const x = r as { name: string; pin: string | null; phone: string | null };
          if (x.pin) onPin(x.name, x.pin, x.phone);
          else onClose();
        }
      }}>
        {mode === "new" ? (
          <>
            <Field label="Nama"><input required minLength={2} value={f.name} onChange={(e) => set("name", e.target.value)} className={inputSm} /></Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Nomor HP"><input required inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0812…" className={inputSm} /></Field>
              <Field label="Peran">
                <select value={f.role} onChange={(e) => set("role", e.target.value)} className={inputSm}>
                  <option value="petugas">Petugas</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </Field>
            </div>
          </>
        ) : (
          <Field label="Petugas / supervisor">
            <select required value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")} className={inputSm}>
              <option value="">— pilih —</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}{u.phone ? ` · ${u.phone}` : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Pos">
          <select value={postId} onChange={(e) => set("post_id", Number(e.target.value))} className={inputSm}>
            {ov?.posts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <ShiftFields v={f} set={(k, v) => set(k, v)} />
        <ErrorNote>{err}</ErrorNote>
        <Actions busy={busy} onClose={onClose} label={mode === "new" ? "Undang" : "Tugaskan"} />
      </form>
    </Dialog>
  );
}

function AssignmentDialog({ a, siteId, onClose }: { a: AssignmentOut; siteId: number; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const { data: ov } = useSWR<SiteOverview>(`/admin/sites/${siteId}/overview`, fetcher);
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
  const [f, setF] = useState({
    post_id: a.post_id, shift_name: a.shift_name ?? "", shift_start: hhmm(a.shift_start), shift_end: hhmm(a.shift_end),
    valid_to: a.valid_to ?? "",
  });
  const { busy, err, save } = useSave(() => mutate(`/admin/sites/${siteId}/overview`));
  return (
    <Dialog title={`Penugasan ${a.user_name}`} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await save(() => api(`/admin/assignments/${a.id}`, {
          method: "PATCH",
          json: { post_id: f.post_id, shift_name: f.shift_name || null, shift_start: f.shift_start || null, shift_end: f.shift_end || null, valid_to: f.valid_to || null },
        }));
        if (ok) onClose();
      }}>
        <Field label="Pos">
          <select value={f.post_id} onChange={(e) => setF({ ...f, post_id: Number(e.target.value) })} className={inputSm}>
            {ov?.posts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <ShiftFields v={f} set={(k, v) => setF({ ...f, [k]: v })} />
        <Field label="Berlaku sampai" hint="Kosongkan kalau tanpa batas.">
          <input type="date" value={f.valid_to} onChange={(e) => setF({ ...f, valid_to: e.target.value })} className={inputSm} />
        </Field>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button type="button" disabled={busy} className={`${btnSm} text-danger-ink underline`}
            onClick={async () => {
              if (!window.confirm(`Hapus penugasan ${a.user_name} di ${a.post_name}?`)) return;
              if ((await save(() => api(`/admin/assignments/${a.id}`, { method: "DELETE" }).then(() => true))) !== undefined) onClose();
            }}>
            Hapus penugasan
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`${btnSm} border-[1.5px] border-field bg-surface`}>Batal</button>
            <button disabled={busy} className={`${btnSm} bg-ink text-on-ink`}>Simpan</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function PinDialog({ name, pin, phone, onClose }: { name: string; pin: string; phone: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const text = `Halo ${name}, akun Ceklis kamu sudah aktif.\nMasuk di ${origin}/masuk dengan nomor HP ${phone ?? ""} dan PIN ${pin}.\nSegera ganti PIN di menu Akun.`;
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  return (
    <Dialog title="PIN petugas" onClose={onClose}>
      <p className="text-sm text-muted">PIN untuk <strong className="text-ink">{name}</strong>. Hanya ditampilkan sekali — catat atau kirim sekarang.</p>
      <div className="rounded-xl bg-ink py-4 text-center font-mono text-[32px] font-bold tracking-[0.3em] text-accent">{pin}</div>
      <div className="flex flex-wrap gap-2">
        <button data-autofocus onClick={async () => {
          await navigator.clipboard?.writeText(pin).catch(() => undefined);
          setCopied(true);
        }} className={`${btnSm} border-[1.5px] border-ink bg-surface`}>{copied ? "Tersalin" : "Salin PIN"}</button>
        <a href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
          className={`${btnSm} bg-accent font-bold text-ink`}>Kirim via WhatsApp</a>
        <button onClick={onClose} className={`${btnSm} ml-auto bg-ink text-on-ink`}>Selesai</button>
      </div>
    </Dialog>
  );
}
