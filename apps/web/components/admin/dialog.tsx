"use client";

import { useEffect, useRef } from "react";
import { Close } from "../icons";

/** Dialog sederhana yang aksesibel: role=dialog, Esc menutup, fokus ke field pertama. */
export function Dialog({ title, onClose, children, wide = false }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("input, select, textarea, button[data-autofocus]");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Tutup" tabIndex={-1} className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div ref={box} role="dialog" aria-modal="true" aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[0_16px_40px_rgba(14,16,15,.25)] sm:rounded-2xl ${wide ? "sm:max-w-[640px]" : "sm:max-w-[460px]"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="flex size-11 items-center justify-center rounded-lg hover:bg-paper-2">
            <Close />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
