import { cachePut, db, type LocalPhoto } from "./db";
import { requestBackgroundSync, syncNow } from "./sync";

export interface QueuedPhoto {
  id: string;
  side: string;
  item_id?: string | null;
  blob: Blob;
}

function photoRows(userId: number, txClientId: string, phase: "in" | "out", photos: QueuedPhoto[]): LocalPhoto[] {
  return photos.map((p) => ({
    id: p.id,
    user_id: userId,
    tx_client_id: txClientId,
    phase,
    side: p.side,
    item_id: p.item_id ?? null,
    blob: p.blob,
    uploaded: 0,
    created_at: Date.now(),
  }));
}

function kick(userId: number) {
  void requestBackgroundSync();
  void syncNow(userId).catch(() => undefined);
}

/** Check in disimpan di HP dulu, lalu dikirim. Tidak pernah menunggu jaringan. */
export async function enqueueCheckin(opts: {
  userId: number;
  postId: number;
  body: { client_id: string } & Record<string, unknown>;
  photos: QueuedPhoto[];
  display: Record<string, unknown>;
}) {
  const cid = opts.body.client_id;
  await db.transaction("rw", db.outbox, db.photos, db.txs, async () => {
    await db.photos.bulkPut(photoRows(opts.userId, cid, "in", opts.photos));
    await db.txs.put({
      client_id: cid,
      user_id: opts.userId,
      post_id: opts.postId,
      data: opts.display,
      state: "parked",
      synced: 0,
      updated_at: Date.now(),
    });
    await db.outbox.add({
      user_id: opts.userId,
      kind: "checkin",
      tx_client_id: cid,
      path: "/transactions",
      body: opts.body,
      status: "pending",
      attempts: 0,
      created_at: Date.now(),
    });
  });
  kick(opts.userId);
}

export async function enqueueCheckout(opts: {
  userId: number;
  postId: number;
  txClientId: string;
  body: { client_id: string } & Record<string, unknown>;
  photos: QueuedPhoto[];
  display: Record<string, unknown>;
}) {
  await db.transaction("rw", db.outbox, db.photos, db.txs, async () => {
    await db.photos.bulkPut(photoRows(opts.userId, opts.txClientId, "out", opts.photos));
    const local = await db.txs.get(opts.txClientId);
    await db.txs.put({
      client_id: opts.txClientId,
      user_id: opts.userId,
      post_id: opts.postId,
      data: { ...(local?.data ?? {}), ...opts.display },
      state: "checked_out",
      synced: 0,
      updated_at: Date.now(),
    });
    await db.outbox.add({
      user_id: opts.userId,
      kind: "checkout",
      tx_client_id: opts.txClientId,
      // Selalu pakai UUID: transaksi yang belum tersinkron belum punya id server
      path: `/transactions/${opts.txClientId}/checkout`,
      body: opts.body,
      status: "pending",
      attempts: 0,
      created_at: Date.now(),
    });
  });
  kick(opts.userId);
}

/** Buang satu data yang ditolak server (setelah dikonfirmasi petugas). */
export async function discardOutbox(id: number) {
  await db.transaction("rw", db.outbox, db.photos, db.txs, async () => {
    const item = await db.outbox.get(id);
    if (!item) return;
    await db.outbox.delete(id);
    const phase = item.kind === "checkin" ? "in" : "out";
    await db.photos.where("tx_client_id").equals(item.tx_client_id).filter((p) => p.phase === phase).delete();
    if (item.kind === "checkin") await db.txs.delete(item.tx_client_id);
    else await db.txs.update(item.tx_client_id, { state: "parked" });
  });
}

export async function rememberUser(userId: number | null) {
  await cachePut("session:user", userId);
}
