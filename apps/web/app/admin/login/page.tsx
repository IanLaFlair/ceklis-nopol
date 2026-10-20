"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { ArrowRight } from "@/components/icons";
import { ErrorNote, Logo, Spinner } from "@/components/ui";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/admin/login", { method: "POST", json: { email, password } });
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? (err.isNetwork ? "Tidak ada koneksi ke server." : err.message) : "Gagal masuk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-4">
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_16px_40px_rgba(14,16,15,.08)]">
        <div className="flex flex-col gap-6 bg-ink px-6 pb-7 pt-8 text-on-ink">
          <Logo sub="Admin · by nopol" />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[30px] leading-[1.05] font-bold tracking-[-0.03em]">Dashboard admin</h1>
            <p className="text-[15px] leading-normal text-[#B4B8B3]">Pantau semua lokasi, transaksi, dan insiden.</p>
          </div>
        </div>
        <div aria-hidden="true" className="hazard h-3" />
        <form onSubmit={submit} className="flex flex-col gap-4 p-6">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Email
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
              className="min-h-[52px] rounded-xl border-[1.5px] border-field bg-surface px-4 text-base font-normal outline-none focus:border-ink" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="min-h-[52px] rounded-xl border-[1.5px] border-field bg-surface px-4 text-base font-normal outline-none focus:border-ink" />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <button disabled={busy} className="tap mt-1 flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] bg-accent text-[17px] font-bold text-ink disabled:opacity-50">
            {busy ? <Spinner /> : null} Masuk <ArrowRight />
          </button>
          <a href="/masuk" className="text-center text-sm text-muted underline">Petugas valet? Masuk di aplikasi petugas</a>
        </form>
      </div>
    </div>
  );
}
