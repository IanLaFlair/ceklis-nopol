import Dexie, { type EntityTable } from "dexie";

/** Satu permintaan tulis yang menunggu dikirim ke API. Dikirim berurutan (FIFO). */
export interface OutboxItem {
  id?: number;
  user_id: number;
  kind: "checkin" | "checkout";
  /** client_id transaksi (UUID dari HP) — dipakai untuk urutan & relasi foto */
  tx_client_id: string;
  path: string;
  body: unknown;
  status: "pending" | "error";
  attempts: number;
  last_error?: string;
  created_at: number;
}

/** Foto tersimpan sebagai Blob sampai terunggah ke presigned URL. */
export interface LocalPhoto {
  id: string; // client_id foto
  user_id: number;
  tx_client_id: string;
  phase: "in" | "out";
  side: string;
  item_id?: string | null;
  blob: Blob;
  uploaded: 0 | 1;
  created_at: number;
}

/** Transaksi yang dibuat/diubah di HP ini, untuk ditampilkan sebelum tersinkron. */
export interface LocalTx {
  client_id: string;
  user_id: number;
  post_id: number;
  /** Bentuk mirip TxDetail; cukup untuk daftar Aktif & layar check out */
  data: Record<string, unknown>;
  state: "parked" | "checked_out";
  synced: 0 | 1;
  updated_at: number;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  updated_at: number;
}

export class CeklisDB extends Dexie {
  outbox!: EntityTable<OutboxItem, "id">;
  photos!: EntityTable<LocalPhoto, "id">;
  txs!: EntityTable<LocalTx, "client_id">;
  cache!: EntityTable<CacheEntry, "key">;

  constructor() {
    super("ceklis");
    this.version(1).stores({
      outbox: "++id, user_id, tx_client_id, status",
      photos: "id, user_id, tx_client_id, uploaded",
      txs: "client_id, user_id, post_id, synced",
      cache: "key",
    });
  }
}

export const db = new CeklisDB();

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await db.cache.get(key))?.value as T | undefined;
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  await db.cache.put({ key, value, updated_at: Date.now() });
}
