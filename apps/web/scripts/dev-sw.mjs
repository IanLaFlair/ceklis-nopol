// Mode dev: Serwist dimatikan, tapi browser yang pernah membuka build produksi masih memegang SW lama
// yang menyajikan chunk basi. public/sw.js versi ini menghapus cache, mencabut dirinya, lalu me-reload tab.
// `next build` menimpa file ini dengan SW asli.
import { writeFileSync } from "node:fs";

writeFileSync(
  new URL("../public/sw.js", import.meta.url),
  `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
`,
);
