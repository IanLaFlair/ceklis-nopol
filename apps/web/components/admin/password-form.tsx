"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Field } from "@/components/admin/dialog";
import { btnSm, card, h2, inputSm } from "@/components/admin/shell";
import { Spinner } from "@/components/ui";

export function PasswordForm() {
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
