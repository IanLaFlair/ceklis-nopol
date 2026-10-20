"use client";

import { useEffect } from "react";

/** Saat dev, SW dimatikan; buang SW + cache sisa build produksi supaya chunk lama tidak tercampur. */
export function DevSwCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map((r) => r.unregister()));
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      window.location.reload();
    });
  }, []);
  return null;
}
