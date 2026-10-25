"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { INCIDENTS_ENABLED } from "@/lib/features";
import { api, ApiError, fetcher } from "@/lib/api/client";
import { useScope, withScope } from "@/lib/admin/scope";
import { ROLE_LABEL, initial } from "@/lib/format";
import type { User } from "@/lib/types";
import { Chart, Check, Clipboard, Close, Dashboard, Car, Gear, Pin, Shield } from "../icons";

const AdminCtx = createContext<User | null>(null);

export function useAdmin(): User {
  const u = useContext(AdminCtx);
  if (!u) throw new Error("useAdmin di luar AdminShell");
  return u;
}

const NAV = [
  { href: "/admin", label: "Dashboard", Icon: Dashboard },
  { href: "/admin/transaksi", label: "Transaksi", Icon: Car },
  ...(INCIDENTS_ENABLED ? [{ href: "/admin/insiden", label: "Insiden / Komplain", Icon: Shield, badge: true }] : []),
  { href: "/admin/lokasi", label: "Lokasi & Petugas", Icon: Pin },
  { href: "/admin/template", label: "Template Checklist", Icon: Clipboard },
  { href: "/admin/laporan", label: "Laporan", Icon: Chart },
  { href: "/admin/pengaturan", label: "Pengaturan", Icon: Gear },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: me, error } = useSWR<User>("/me", fetcher, { shouldRetryOnError: false });

  useEffect(() => {
    if (path === "/admin/login") return;
    if ((error instanceof ApiError && error.status === 401) || me?.role === "petugas") {
      router.replace("/admin/login");
    }
  }, [error, me, path, router]);

  if (path === "/admin/login") return <>{children}</>;
  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <div className="flex min-h-(--admin-vh) items-center justify-center p-6 text-center text-muted">
        <p>Server tidak terjangkau. {error.message}</p>
      </div>
    );
  }
  if (!me || me.role === "petugas") return <div aria-busy="true" className="min-h-(--admin-vh) bg-paper" />;

  return (
    <AdminCtx.Provider value={me}>
      <Frame user={me}>{children}</Frame>
    </AdminCtx.Provider>
  );
}

function Frame({ user, children }: { user: User; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [scope] = useScope();
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();
  const { data: inc } = useSWR<{ pending: number }>(INCIDENTS_ENABLED ? "/admin/incidents?status=pending&limit=1" : null, fetcher, {
    refreshInterval: 15000,
  });

  useEffect(() => setOpen(false), [path]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    // Buang semua data akun ini supaya akun berikutnya tidak melihatnya sekilas
    await mutate(() => true, undefined, { revalidate: false });
    router.replace("/admin/login");
  }

  const sidebar = (
    <aside className="flex h-full flex-col gap-6 bg-ink px-3.5 py-[22px] text-[#B4B8B3]">
      <Link href={withScope("/admin", scope)} className="flex items-center gap-2.5 px-2 py-1 text-on-ink">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-accent text-ink">
          <Check size={18} stroke={2.6} />
        </span>
        <span className="flex flex-col leading-[1.1]">
          <span className="font-display text-xl font-bold">ceklis</span>
          <span className="text-[11px] text-[#8F948E]">Admin · by nopol</span>
        </span>
      </Link>
      <nav aria-label="Admin" className="flex flex-col gap-0.5 text-[15px]">
        {NAV.map(({ href, label, Icon, badge }) => {
          const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
          return (
            <Link key={href} href={withScope(href, scope)} aria-current={on ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#1E2220] hover:text-white ${on ? "bg-[#1E2220] text-white shadow-[inset_2px_0_0_var(--color-accent)]" : ""}`}>
              <Icon size={18} stroke={1.8} />
              <span className="flex-1">{label}</span>
              {badge && inc && inc.pending > 0 && (
                <span className="rounded-full bg-danger px-[7px] py-0.5 text-[11px] font-bold text-white" aria-label={`${inc.pending} insiden menunggu`}>
                  {inc.pending}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-1.5 py-1 text-[13px]">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-3 font-semibold text-on-ink">
            {initial(user.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-on-ink">{user.name}</span>
            <span className="text-[#8F948E]">{ROLE_LABEL[user.role]}</span>
          </div>
        </div>
        <button onClick={logout} className="min-h-11 rounded-lg border border-ink-line px-3 text-left text-sm hover:bg-[#1E2220] hover:text-white">
          Keluar
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-(--admin-vh) bg-paper text-ink lg:flex">
      <div className="hidden w-[232px] shrink-0 bg-ink lg:block">
        <div className="sticky top-0 h-(--admin-vh)">{sidebar}</div>
      </div>
      {/* bar atas untuk layar kecil */}
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-ink px-4 py-3 text-on-ink lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Buka menu" aria-expanded={open}
          className="flex size-11 items-center justify-center rounded-lg bg-ink-2">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span className="font-display text-lg font-bold">ceklis</span>
        <span className="text-xs text-on-ink-muted">Admin</span>
        {inc && inc.pending > 0 && (
          <Link href={withScope("/admin/insiden", scope)} className="ml-auto rounded-full bg-danger px-2.5 py-1 text-xs font-bold text-white">
            {inc.pending} insiden
          </Link>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu admin"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <button aria-label="Tutup menu" className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw]">
            <button onClick={() => setOpen(false)} aria-label="Tutup" autoFocus
              className="absolute right-2 top-3 z-10 flex size-11 items-center justify-center rounded-lg text-on-ink">
              <Close />
            </button>
            {sidebar}
          </div>
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-12 pt-5 sm:px-8 sm:pt-6">{children}</main>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] sm:text-[30px]">{title}</h1>
        {sub && <span className="text-sm text-muted">{sub}</span>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

export const card = "rounded-[14px] border border-line bg-surface";
export const h2 = "font-display text-[17px] font-bold";
export const btnSm =
  "tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50";
export const inputSm =
  "min-h-11 w-full rounded-[10px] border-[1.5px] border-field bg-surface px-3 text-base outline-none focus:border-ink sm:text-sm";
