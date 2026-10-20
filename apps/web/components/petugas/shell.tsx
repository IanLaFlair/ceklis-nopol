"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, Clock, Home, Person } from "../icons";
import { useSession } from "./session";

const TABS = [
  { href: "/", label: "Beranda", Icon: Home },
  { href: "/aktif", label: "Aktif", Icon: Car },
  { href: "/riwayat", label: "Riwayat", Icon: Clock },
  { href: "/akun", label: "Akun", Icon: Person },
];

/** Kerangka layar petugas: header gelap (diisi halaman), konten terang, tab bar bawah. */
export function Screen({ header, children, footer, tabs = true }: {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tabs?: boolean;
}) {
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-paper">
      <header className="bg-ink px-5 pb-4 pt-[max(env(safe-area-inset-top),20px)] text-on-ink">{header}</header>
      <main className="flex flex-1 flex-col [&>*]:shrink-0 gap-4 overflow-y-auto px-5 pb-6 pt-[18px]">{children}</main>
      {footer}
      {tabs && <TabBar />}
    </div>
  );
}

export function TabBar() {
  const path = usePathname();
  const { pending } = useSession();
  return (
    <nav aria-label="Menu" className="safe-bottom grid grid-cols-4 border-t border-line bg-surface px-2 pt-1.5">
      {TABS.map(({ href, label, Icon }) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`relative flex min-h-[52px] flex-col items-center justify-center gap-[3px] text-[11px] ${on ? "font-semibold" : "text-muted"}`}>
            {on ? (
              <span className="flex h-7 w-12 items-center justify-center rounded-full bg-accent text-ink"><Icon size={20} /></span>
            ) : (
              <Icon size={22} stroke={1.8} />
            )}
            {label}
            {href === "/akun" && pending.total > 0 && (
              <span className="absolute right-[22%] top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white"
                aria-label={`${pending.total} data belum terkirim`}>
                {pending.total}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Badge kecil di header: jumlah data tertunda (PRD §8). */
export function PendingPill() {
  const { pending } = useSession();
  if (!pending.total) return null;
  return (
    <Link href="/akun" className="inline-flex items-center gap-1.5 rounded-full bg-ink-3 px-2.5 py-1 text-xs font-semibold text-accent">
      <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
      {pending.total} belum terkirim
    </Link>
  );
}
