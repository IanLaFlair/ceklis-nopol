"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, ApiError, fetcher } from "@/lib/api/client";
import { canManage } from "@/lib/admin/actions";
import type { AdminUserRow } from "@/lib/admin/types";
import { ROLE_LABEL, dateTime } from "@/lib/format";
import type { Role } from "@/lib/types";
import { Dialog, Field } from "@/components/admin/dialog";
import { PageHead, btnSm, card, h2, inputSm, useAdmin } from "@/components/admin/shell";
import { Search } from "@/components/icons";
import { Badge, ErrorNote, Spinner } from "@/components/ui";

const ACCESS: [Role, string][] = [
  ["super_admin", "Semua klien, lokasi, template, dan user."],
  ["client_admin", "Semua lokasi milik satu klien (mis. Pakuwon Group): lokasi, pos, petugas, template klien, laporan."],
  ["supervisor", "Satu lokasi: masuk dashboard dengan email & password, lihat semua pos di lokasinya dan memutuskan insiden. Ditambahkan dari Lokasi & Petugas."],
  ["petugas", "Aplikasi petugas (PWA) saja: check in / check out di pos yang ditugaskan."],
];

export default function PengaturanPage() {
  const me = useAdmin();
  const manage = canManage(me.role);
  const { mutate } = useSWRConfig();
  const [q, setQ] = useState("");
  const key = `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const { data: users, error } = useSWR<AdminUserRow[]>(key, fetcher);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function patch(u: AdminUserRow, body: Record<string, unknown>) {
    setMsg(null);
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", json: body });
      await mutate(key);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Gagal menyimpan");
    }
  }

  const roles = (me.role === "super_admin" ? ["super_admin", "client_admin", "supervisor", "petugas"] : ["client_admin", "supervisor", "petugas"]) as Role[];

  return (
    <>
      <PageHead title="Pengaturan" sub="Hak akses, user admin, dan akun kamu.">
        {manage && <button onClick={() => setCreating(true)} className={`${btnSm} bg-accent font-bold text-ink`}>Tambah user admin</button>}
      </PageHead>
      {(error || msg) && <ErrorNote>{error?.message ?? msg}</ErrorNote>}

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E6E0] px-5 py-4">
          <h2 className={h2}>User</h2>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-[10px] border-[1.5px] border-field px-3 sm:w-[280px]">
            <Search size={16} />
            <span className="sr-only">Cari user</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, HP, atau ID"
              className="min-w-0 flex-1 border-0 bg-transparent text-base outline-none sm:text-sm" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.05em] text-muted uppercase">
                <th className="px-5 py-2.5 font-medium">Nama</th>
                <th className="px-3 py-2.5 font-medium">Kontak</th>
                <th className="px-3 py-2.5 font-medium">Peran</th>
                <th className="px-3 py-2.5 font-medium">Terakhir aktif</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-t border-line-2 hover:bg-paper-2">
                  <td className="px-5 py-3"><span className="font-semibold">{u.name}</span><span className="block text-xs text-muted">{u.staff_code ?? ""}</span></td>
                  <td className="px-3 py-3 text-muted">{u.email ?? u.phone ?? "-"}</td>
                  <td className="px-3 py-3">
                    {manage && u.id !== me.id && (me.role === "super_admin" || u.role !== "super_admin") ? (
                      <select aria-label={`Peran ${u.name}`} value={u.role} onChange={(e) => patch(u, { role: e.target.value })}
                        className="min-h-10 rounded-lg border-[1.5px] border-field bg-surface px-2 text-base sm:text-sm">
                        {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : ROLE_LABEL[u.role]}
                  </td>
                  <td className="px-3 py-3 text-muted">{u.last_active_at ? dateTime(u.last_active_at) : "-"}</td>
                  <td className="px-5 py-3">
                    {manage && u.id !== me.id ? (
                      <button onClick={() => patch(u, { active: !u.active })} className="flex min-h-11 items-center gap-2"
                        aria-label={`${u.active ? "Nonaktifkan" : "Aktifkan"} ${u.name}`}>
                        <Badge tone={u.active ? "released" : "local"}>{u.active ? "Aktif" : "Nonaktif"}</Badge>
                        <span className="text-xs text-muted underline">{u.active ? "nonaktifkan" : "aktifkan"}</span>
                      </button>
                    ) : <Badge tone={u.active ? "released" : "local"}>{u.active ? "Aktif" : "Nonaktif"}</Badge>}
                  </td>
                </tr>
              ))}
              {users && !users.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">Tidak ada user.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3.5">
        <section className={`${card} flex min-w-0 flex-[1.4_1_380px] flex-col gap-3 p-5`}>
          <h2 className={h2}>Hak akses</h2>
          <dl className="flex flex-col">
            {ACCESS.map(([r, d]) => (
              <div key={r} className="flex flex-col gap-0.5 border-t border-line-2 py-2.5 first:border-t-0 sm:flex-row sm:gap-4">
                <dt className="w-[130px] shrink-0 font-semibold">{ROLE_LABEL[r]}</dt>
                <dd className="text-sm text-muted">{d}</dd>
              </div>
            ))}
          </dl>
          <span className="text-xs text-muted">Petugas tidak memilih lokasi sendiri; admin yang menugaskan per pos dan shift.</span>
        </section>
        <PasswordForm />
      </div>

      {creating && <CreateUser roles={roles.filter((r) => r !== "petugas" && r !== "supervisor")} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void mutate(key); }} />}
    </>
  );
}

function PasswordForm() {
  const [oldPw, setOld] = useState("");
  const [newPw, setNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className={`${card} flex min-w-0 flex-[1_1_280px] flex-col gap-3 p-5`} onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setMsg(null);
      try {
        await api("/auth/password", { method: "POST", json: { old_password: oldPw, new_password: newPw } });
        setMsg({ ok: true, text: "Password diganti." });
        setOld("");
        setNew("");
      } catch (err) {
        setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Gagal" });
      } finally {
        setBusy(false);
      }
    }}>
      <h2 className={h2}>Ganti password</h2>
      <Field label="Password lama"><input type="password" required autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} className={inputSm} /></Field>
      <Field label="Password baru" hint="Minimal 8 karakter."><input type="password" required minLength={8} autoComplete="new-password" value={newPw} onChange={(e) => setNew(e.target.value)} className={inputSm} /></Field>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger-ink"}`}>{msg.text}</p>}
      <button disabled={busy} className={`${btnSm} self-start bg-ink text-on-ink`}>{busy && <Spinner />}Simpan password</button>
    </form>
  );
}

function CreateUser({ roles, onClose, onSaved }: { roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const me = useAdmin();
  const { data: clients } = useSWR<{ id: number; name: string }[]>("/admin/clients", fetcher);
  const [f, setF] = useState({ name: "", email: "", phone: "", role: roles.includes("client_admin") ? "client_admin" : roles[0], client_id: 0, password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const clientId = f.client_id || clients?.[0]?.id || null;

  return (
    <Dialog title="Tambah user admin" onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api("/admin/users", {
            method: "POST",
            json: {
              name: f.name, email: f.email || null, phone: f.phone || null, role: f.role, password: f.password,
              client_id: f.role === "super_admin" ? null : me.role === "super_admin" ? clientId : me.client_id,
            },
          });
          onSaved();
        } catch (x) {
          setErr(x instanceof ApiError ? x.message : "Gagal");
        } finally {
          setBusy(false);
        }
      }}>
        <Field label="Nama"><input required minLength={2} value={f.name} onChange={(e) => set("name", e.target.value)} className={inputSm} /></Field>
        <Field label="Peran">
          <select value={f.role} onChange={(e) => set("role", e.target.value)} className={inputSm}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {me.role === "super_admin" && f.role !== "super_admin" && (
          <Field label="Klien">
            <select value={clientId ?? ""} onChange={(e) => set("client_id", Number(e.target.value))} className={inputSm}>
              {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Email"><input type="email" required value={f.email} onChange={(e) => set("email", e.target.value)} className={inputSm} /></Field>
        <Field label="Password awal" hint="Minimal 8 karakter."><input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} className={inputSm} /></Field>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btnSm} border-[1.5px] border-field bg-surface`}>Batal</button>
          <button disabled={busy} className={`${btnSm} bg-ink text-on-ink`}>{busy && <Spinner />}Simpan</button>
        </div>
      </form>
    </Dialog>
  );
}
