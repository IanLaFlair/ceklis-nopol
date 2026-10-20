"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { api, fetcher } from "../api/client";
import { cacheGet, cachePut, db } from "../offline/db";
import { useLiveQuery } from "../offline/hooks";
import type { TxDetail, TxListItem } from "../types";

export type ActiveItem = TxListItem & { local?: boolean };

const ACTIVE = "parked,incident_pending,incident_confirmed";

/** Kendaraan di pos: daftar server (atau cache-nya saat offline) digabung dengan transaksi lokal yang belum terkirim. */
export function useActiveList(postId: number) {
  const key = `/transactions?post_id=${postId}&status=${ACTIVE}`;
  const { data, error, isLoading, mutate } = useSWR<TxListItem[]>(key, fetcher, { refreshInterval: 30_000 });

  useEffect(() => {
    if (data) void cachePut(`active:${postId}`, data);
  }, [data, postId]);

  const cached = useLiveQuery(() => cacheGet<TxListItem[]>(`active:${postId}`), [postId], undefined);
  const locals = useLiveQuery(() => db.txs.where("post_id").equals(postId).toArray(), [postId], []);

  const base = data ?? cached ?? [];
  const gone = new Set(locals.filter((l) => l.state === "checked_out").map((l) => l.client_id));
  const known = new Set(base.map((t) => t.client_id));
  const pendingLocal = locals
    .filter((l) => l.state === "parked" && !known.has(l.client_id) && !l.synced)
    .map((l) => ({ ...(l.data as unknown as TxListItem), local: true }));
  const items: ActiveItem[] = [...pendingLocal, ...base.filter((t) => !gone.has(t.client_id))].sort(
    (a, b) => +new Date(b.checkin_at) - +new Date(a.checkin_at),
  );
  return { items, offline: !!error && !data, loading: isLoading && !cached, refresh: mutate };
}

/** Detail transaksi: server → cache → transaksi lokal (dibuat offline di HP ini). */
export async function loadTransaction(ref: string): Promise<{ tx: TxDetail; source: "server" | "cache" | "local" } | null> {
  try {
    const tx = await api<TxDetail>(`/transactions/${encodeURIComponent(ref)}`);
    await cachePut(`tx:${tx.client_id}`, tx);
    await cachePut(`tx:${tx.id}`, tx);
    return { tx, source: "server" };
  } catch (e) {
    if ((e as { status?: number }).status === 404) {
      const local = await db.txs.get(ref);
      return local ? { tx: local.data as unknown as TxDetail, source: "local" } : null;
    }
  }
  const cached = await cacheGet<TxDetail>(`tx:${ref}`);
  if (cached) return { tx: cached, source: "cache" };
  const local = await db.txs.get(ref);
  return local ? { tx: local.data as unknown as TxDetail, source: "local" } : null;
}

/** Simpan detail kendaraan aktif ke cache supaya check out tetap bisa saat sinyal hilang. */
export async function warmDetails(items: ActiveItem[]) {
  for (const it of items.filter((i) => !i.local).slice(0, 40)) {
    if (await cacheGet(`tx:${it.client_id}`)) continue;
    try {
      const tx = await api<TxDetail>(`/transactions/${it.id}`);
      await cachePut(`tx:${tx.client_id}`, tx);
      await cachePut(`tx:${tx.id}`, tx);
    } catch {
      return;
    }
  }
}

export function useLocalPhotos(txClientId: string | undefined) {
  return useLiveQuery(
    () => (txClientId ? db.photos.where("tx_client_id").equals(txClientId).toArray() : Promise.resolve([])),
    [txClientId],
    [],
  );
}
