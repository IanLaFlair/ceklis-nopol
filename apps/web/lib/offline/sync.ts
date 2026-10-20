// Sinkronisasi antrean offline (PRD §8). Tanpa DOM supaya bisa dipakai juga di service worker (Background Sync).
import { api, ApiError } from "../api/client";
import { db } from "./db";

export const SYNC_TAG = "ceklis-sync";

export interface SyncResult {
  sent: number;
  uploaded: number;
  failed: number;
  stoppedBy?: "offline" | "auth";
}

interface Presigned {
  photo_id: string;
  url: string | null;
  uploaded: boolean;
  headers: Record<string, string>;
}

const running = new Map<number, Promise<SyncResult>>();

/** Satu sinkronisasi per user pada satu waktu, termasuk antar tab/SW kalau Web Locks tersedia. */
export function syncNow(userId: number): Promise<SyncResult> {
  const current = running.get(userId);
  if (current) return current;
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  const run = () => doSync(userId);
  const p = ((locks ? locks.request(SYNC_TAG, run) : run()) as Promise<SyncResult>).finally(() => running.delete(userId));
  running.set(userId, p);
  return p;
}

async function doSync(userId: number): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, uploaded: 0, failed: 0 };
  const blocked = new Set<string>();

  const items = await db.outbox.where("user_id").equals(userId).sortBy("id");
  for (const item of items) {
    // Item lanjutan dari transaksi yang gagal ditahan supaya urutan check in → check out terjaga
    if (blocked.has(item.tx_client_id)) continue;
    try {
      const res = await api<Record<string, unknown>>(item.path, { method: "POST", json: item.body });
      await db.transaction("rw", db.outbox, db.txs, async () => {
        await db.outbox.delete(item.id!);
        const local = await db.txs.get(item.tx_client_id);
        if (local) {
          const stillQueued = await db.outbox.where("tx_client_id").equals(item.tx_client_id).count();
          await db.txs.update(item.tx_client_id, {
            data: { ...local.data, ...res },
            synced: stillQueued ? 0 : 1,
            updated_at: Date.now(),
          });
        }
      });
      result.sent++;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      if (err.isNetwork || err.status >= 500 || err.status === 429) {
        await db.outbox.update(item.id!, { attempts: item.attempts + 1, last_error: err.message });
        result.stoppedBy = "offline";
        return result;
      }
      if (err.status === 401) {
        result.stoppedBy = "auth";
        return result;
      }
      // Ditolak server (mis. plat masih parkir). Data TIDAK dihapus — ditampilkan di Akun untuk ditindaklanjuti.
      await db.outbox.update(item.id!, { status: "error", attempts: item.attempts + 1, last_error: err.message });
      blocked.add(item.tx_client_id);
      result.failed++;
    }
  }

  // Foto hanya diunggah setelah transaksinya terdaftar di server
  const queued = new Set((await db.outbox.where("user_id").equals(userId).toArray()).map((o) => o.tx_client_id));
  const photos = (await db.photos.where("uploaded").equals(0).toArray()).filter(
    (p) => p.user_id === userId && !queued.has(p.tx_client_id),
  );
  for (let i = 0; i < photos.length; i += 10) {
    const batch = photos.slice(i, i + 10);
    try {
      const signed = await api<Presigned[]>("/uploads/presign", { method: "POST", json: { photo_ids: batch.map((p) => p.id) } });
      const done: string[] = [];
      for (const s of signed) {
        const photo = batch.find((p) => p.id === s.photo_id);
        if (!photo) continue;
        if (s.url) {
          const put = await fetch(s.url, { method: "PUT", body: photo.blob, headers: s.headers }).catch(() => null);
          if (!put?.ok) {
            result.stoppedBy = "offline";
            break;
          }
        }
        done.push(photo.id);
      }
      if (done.length) {
        await api("/uploads/complete", { method: "POST", json: { photo_ids: done } });
        // Blob dihapus setelah terunggah supaya penyimpanan HP tidak penuh
        await db.photos.bulkDelete(done);
        result.uploaded += done.length;
      }
      if (result.stoppedBy) return result;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      if (err.status === 401) result.stoppedBy = "auth";
      else if (err.isNetwork || err.status >= 500) result.stoppedBy = "offline";
      else result.failed += batch.length;
      return result;
    }
  }
  return result;
}

export async function pendingCounts(userId: number) {
  const [items, photos] = await Promise.all([
    db.outbox.where("user_id").equals(userId).toArray(),
    db.photos.where("uploaded").equals(0).filter((p) => p.user_id === userId).count(),
  ]);
  return {
    data: items.length,
    errors: items.filter((i) => i.status === "error"),
    photos,
    total: items.length + photos,
  };
}

/** Minta Background Sync ke service worker; fallback: sinkron saat app dibuka / event online. */
export async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync;
    await sync?.register(SYNC_TAG);
  } catch {
    // tidak didukung (mis. iOS Safari) — fallback di useSync
  }
}
