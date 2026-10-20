"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api/client";
import { useScope } from "@/lib/admin/scope";
import type { ScopeClient } from "@/lib/admin/types";
import { ChevronDown, Pin, Search } from "../icons";

interface Opt {
  id: string;
  label: string;
  meta: string;
  depth: number;
  path: string;
}

/** Filter lokasi bertingkat: Semua → klien → lokasi → pos. */
export function ScopePicker() {
  const [scope, setScope] = useScope();
  const { data } = useSWR<ScopeClient[]>("/admin/scope-tree", fetcher);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const opts = useMemo<Opt[]>(() => {
    const out: Opt[] = [];
    const tree = data ?? [];
    const sites = tree.flatMap((c) => c.sites);
    out.push({ id: "all", label: "Semua lokasi", meta: `${sites.length} lokasi · ${sites.reduce((a, s) => a + s.posts.length, 0)} pos`, depth: 0, path: "Semua lokasi" });
    for (const c of tree) {
      if (tree.length > 1) out.push({ id: `client:${c.id}`, label: c.name, meta: `${c.sites.length} lokasi`, depth: 0, path: c.name });
      for (const s of c.sites) {
        const d = tree.length > 1 ? 1 : 0;
        out.push({ id: `site:${s.id}`, label: s.name, meta: `${s.posts.length} pos`, depth: d, path: s.name });
        if (s.posts.length > 1) {
          for (const p of s.posts) out.push({ id: `post:${p.id}`, label: p.name, meta: p.active ? "" : "nonaktif", depth: d + 1, path: `${s.name} · ${p.name}` });
        }
      }
    }
    return out;
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cur = opts.find((o) => o.id === scope);
  const filtered = q ? opts.filter((o) => o.path.toLowerCase().includes(q.toLowerCase())) : opts;

  return (
    <div ref={wrap} className="relative w-full sm:w-auto" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        className="flex min-h-[46px] w-full items-center gap-2.5 rounded-xl border-[1.5px] border-field bg-surface px-3.5 text-left text-sm sm:min-w-[300px]">
        <Pin size={18} />
        <span className="flex-1 truncate font-semibold">{cur?.path ?? "Semua lokasi"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex max-h-[420px] w-full flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(14,16,15,.15)] sm:w-[340px]">
          <label className="mb-1 flex min-h-10 items-center gap-2 rounded-lg border border-line px-2.5 text-sm text-muted">
            <Search size={15} />
            <span className="sr-only">Cari lokasi</span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari lokasi atau lobby"
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none sm:text-sm" />
          </label>
          <div role="listbox" aria-label="Lokasi">
            {filtered.map((o) => (
              <button key={o.id} role="option" aria-selected={o.id === scope}
                onClick={() => { setScope(o.id); setOpen(false); setQ(""); }}
                style={{ paddingLeft: 10 + o.depth * 20 }}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg pr-2.5 text-left text-sm hover:bg-paper ${o.id === scope ? "bg-warning-bg font-semibold" : ""}`}>
                <span className="flex-1">{o.label}</span>
                <span className="text-xs text-muted-2">{o.meta}</span>
              </button>
            ))}
            {!filtered.length && <p className="p-3 text-sm text-muted">Tidak ada lokasi yang cocok.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
