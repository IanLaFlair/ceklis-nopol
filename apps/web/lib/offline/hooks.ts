"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { pendingCounts, syncNow, type SyncResult } from "./sync";

export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: () => undefined });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function usePending(userId: number | undefined) {
  return useLiveQuery(
    () => (userId ? pendingCounts(userId) : Promise.resolve({ data: 0, errors: [], photos: 0, total: 0 })),
    [userId],
    { data: 0, errors: [], photos: 0, total: 0 },
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Fallback Background Sync: coba kirim saat app dibuka, saat online, dan berkala selama masih ada antrean. */
export function useSyncLoop(userId: number | undefined, pending: number, onAuthLost?: () => void) {
  const [last, setLast] = useState<SyncResult | null>(null);
  useEffect(() => {
    if (!userId) return;
    const run = () =>
      syncNow(userId)
        .then((r) => {
          setLast(r);
          if (r.stoppedBy === "auth") onAuthLost?.();
        })
        .catch(() => undefined);
    run();
    window.addEventListener("online", run);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    const timer = pending > 0 ? window.setInterval(run, 20_000) : undefined;
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pending > 0]);
  return last;
}
