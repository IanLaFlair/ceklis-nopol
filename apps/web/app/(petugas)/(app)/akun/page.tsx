"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Screen } from "@/components/petugas/shell";
import { useSession } from "@/components/petugas/session";
import { ChevronRight, Phone } from "@/components/icons";
import { btnPrimary, ErrorNote, field } from "@/components/ui";
import { api } from "@/lib/api/client";
import { initial, ROLE_LABEL } from "@/lib/format";
import { syncNow } from "@/lib/offline/sync";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

export default function AkunPage() {
  const router = useRouter();
  const { user, assignment, pending } = useSession();
  const active = assignment.active!;
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function sync() {
    const r = await syncNow(user.id).catch(() => null);
    if (r?.stoppedBy === "auth") router.replace("/masuk?sesi=habis");
  }

  async function logout(force = false) {
    if (pending.total > 0 && !force) {
      setConfirmLogout(true);
      return;
    }
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/masuk");
  }

  const spv = assignment.supervisors[0];

  return (
    <Screen
      header={
        <div className="flex items-center gap-3.5 pb-1.5">
          <span aria-hidden="true" className="flex size-[60px] items-center justify-center rounded-full bg-accent font-display text-2xl font-bold text-ink">{initial(user.name)}</span>
          <div className="flex flex-col gap-0.5">
            <strong className="font-display text-[22px]">{user.name}</strong>
            <span className="text-[13px] text-on-ink-muted">{user.role === "petugas" ? "Petugas valet" : ROLE_LABEL[user.role]}{user.staff_code ? ` · ID ${user.staff_code}` : ""}</span>
          </div>
        </div>
      }
    >
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted">Tugas hari ini</h2>
        <div className="flex flex-col gap-0.5">
          <strong className="text-[17px]">{active.site.name} · {active.post.name}</strong>
          <span className="text-sm text-muted">{active.shift ?? "Tanpa jadwal shift"}</span>
        </div>
        {spv && (
          <div className="flex items-center gap-2.5 rounded-[10px] bg-paper-2 px-3 py-2.5">
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-on-ink">{initial(spv.name)}</span>
            <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{spv.name}</span><span className="text-xs text-muted">Supervisor</span></span>
            {spv.phone && (
              <a href={`tel:${spv.phone}`} aria-label="Telepon supervisor" className="flex size-11 items-center justify-center rounded-[10px] bg-accent text-ink"><Phone size={18} /></a>
            )}
          </div>
        )}
        <span className="text-xs text-muted">Pos tugas diatur admin. Minta supervisor kalau perlu pindah pos.</span>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <button onClick={() => setPinOpen((v) => !v)} aria-expanded={pinOpen} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
          <span className="flex-1 text-[15px]">Ganti PIN</span><ChevronRight size={18} className={`text-muted transition ${pinOpen ? "rotate-90" : ""}`} />
        </button>
        {pinOpen && <PinForm onDone={() => setPinOpen(false)} />}
      </section>

      <button onClick={() => logout()} className="flex min-h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-danger text-[15px] font-semibold text-danger-ink">
        Keluar dari akun
      </button>
      <span className="text-center text-xs text-muted-2">ceklis · versi {VERSION}</span>

      {confirmLogout && (
        <div role="dialog" aria-modal="true" aria-labelledby="logout-title" className="fixed inset-0 z-40 flex items-end bg-ink/50">
          <div className="safe-bottom mx-auto flex w-full max-w-[480px] flex-col gap-3 rounded-t-2xl bg-surface p-5">
            <h2 id="logout-title" className="font-display text-xl font-bold">Masih ada {pending.total} data belum terkirim</h2>
            <p className="text-sm leading-normal text-muted">
              Sebaiknya tunggu sampai terkirim. Kalau tetap keluar, data tidak hilang: tetap tersimpan di HP ini dan dikirim setelah kamu masuk lagi di HP yang sama.
            </p>
            <button onClick={() => { setConfirmLogout(false); void sync(); }} className={btnPrimary}>Kirim dulu</button>
            <button onClick={() => logout(true)} className="min-h-12 rounded-[14px] border-[1.5px] border-danger font-semibold text-danger-ink">Tetap keluar</button>
            <button onClick={() => setConfirmLogout(false)} className="min-h-12 font-semibold text-muted">Batal</button>
          </div>
        </div>
      )}
    </Screen>
  );
}

function PinForm({ onDone }: { onDone: () => void }) {
  const [oldPin, setOld] = useState("");
  const [newPin, setNew] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/auth/pin", { method: "POST", json: { old_pin: oldPin, new_pin: newPin } });
      setOk(true);
      setTimeout(onDone, 1200);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line-2 p-4">
      <input type="password" inputMode="numeric" value={oldPin} onChange={(e) => setOld(digits(e.target.value))} placeholder="PIN lama" aria-label="PIN lama" className={`${field} font-mono tracking-[0.3em]`} />
      <input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNew(digits(e.target.value))} placeholder="PIN baru (6 digit)" aria-label="PIN baru" className={`${field} font-mono tracking-[0.3em]`} />
      <ErrorNote>{error}</ErrorNote>
      {ok && <p className="text-sm font-semibold text-success">PIN diganti.</p>}
      <button disabled={oldPin.length !== 6 || newPin.length !== 6} className={btnPrimary}>Simpan PIN</button>
    </form>
  );
}
