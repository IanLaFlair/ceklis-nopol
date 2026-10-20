/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";
import { cacheGet } from "@/lib/offline/db";
import { SYNC_TAG, syncNow } from "@/lib/offline/sync";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Data API tidak di-cache SW: app menyimpan cache-nya sendiri di IndexedDB per user
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/checkout/offline",
        matcher: ({ request }) => request.destination === "document" && new URL(request.url).pathname.startsWith("/checkout/"),
      },
      { url: "/", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();

interface SyncEvent extends ExtendableEvent {
  tag: string;
}

// Background Sync: kirim antrean walau app sudah ditutup (Chrome/Android). Gagal → browser coba lagi nanti.
self.addEventListener("sync", (event) => {
  const e = event as SyncEvent;
  if (e.tag !== SYNC_TAG) return;
  e.waitUntil(
    (async () => {
      const userId = await cacheGet<number | null>("session:user");
      if (!userId) return;
      const r = await syncNow(userId);
      if (r.stoppedBy === "offline") throw new Error("masih offline");
    })(),
  );
});
