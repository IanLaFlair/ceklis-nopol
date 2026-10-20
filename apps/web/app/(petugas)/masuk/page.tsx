"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, Pin } from "@/components/icons";
import { btnPrimary, ErrorNote, field, Logo, Spinner } from "@/components/ui";
import { api } from "@/lib/api/client";
import { cachePut } from "@/lib/offline/db";
import { rememberUser } from "@/lib/offline/queue";
import type { User } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const expired = useSearchParams().get("sesi") === "habis";
  const [login, setLogin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(expired ? "Sesi berakhir. Masuk lagi untuk mengirim data yang tertunda." : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>("/auth/petugas/login", { method: "POST", json: { login, pin } });
      await cachePut("session:me", user);
      await rememberUser(user.id);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-paper">
      <div className="flex flex-col gap-7 bg-ink px-6 pb-8 pt-[max(env(safe-area-inset-top),48px)] text-on-ink">
        <Logo />
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.03em]">
            Checklist valet,
            <br />
            cepat &amp; rapi.
          </h1>
          <p className="text-[15px] leading-normal text-[#B4B8B3]">Catat kondisi kendaraan saat masuk dan keluar, lengkap dengan foto.</p>
        </div>
      </div>
      <div aria-hidden="true" className="hazard h-3" />

      <form onSubmit={submit} className="flex flex-1 flex-col gap-[18px] px-6 pb-6 pt-7">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          ID petugas atau nomor HP
          <input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" inputMode="text"
            placeholder="mis. 0812 3456 7890" className={`${field} min-h-14 text-[17px]`} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          PIN
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} required
            type="password" inputMode="numeric" autoComplete="current-password" pattern="\d{6}" maxLength={6}
            placeholder="6 digit" className={`${field} min-h-14 font-mono text-xl tracking-[0.3em]`} />
        </label>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" disabled={busy || pin.length !== 6 || !login} className={`${btnPrimary} mt-1`}>
          {busy ? <Spinner /> : null}
          Masuk
          <ArrowRight />
        </button>
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3.5 text-[13px] leading-normal text-muted">
          <Pin size={18} className="mt-px shrink-0 text-ink" />
          Lokasi dan pos tugas (mis. Lobby 2) diatur oleh admin. Hubungi supervisor kalau lokasi kamu salah.
        </div>
        <a href="/admin/login" className="mt-auto text-center text-xs text-muted-2 underline-offset-2 hover:underline">
          ceklis.nopol-lpr.com · masuk sebagai admin
        </a>
      </form>
    </div>
  );
}

export default function MasukPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
