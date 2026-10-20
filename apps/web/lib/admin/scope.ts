"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Filter lokasi bertingkat disimpan di URL (?scope=) dan dibawa antar halaman admin. */
export function useScope(): [string, (s: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const scope = params.get("scope") || "all";
  const set = useCallback(
    (s: string) => {
      const q = new URLSearchParams(params.toString());
      if (s === "all") q.delete("scope");
      else q.set("scope", s);
      q.delete("id");
      const qs = q.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [params, router, path],
  );
  return [scope, set];
}

/** Ubah satu query param tanpa menghapus yang lain. */
export function useQueryParam(name: string): [string | null, (v: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const value = params.get(name);
  const set = useCallback(
    (v: string | null) => {
      const q = new URLSearchParams(params.toString());
      if (v == null || v === "") q.delete(name);
      else q.set(name, v);
      const qs = q.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [params, router, path, name],
  );
  return [value, set];
}

export function withScope(href: string, scope: string): string {
  return scope && scope !== "all" ? `${href}?scope=${encodeURIComponent(scope)}` : href;
}
