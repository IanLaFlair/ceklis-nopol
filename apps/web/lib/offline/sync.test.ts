import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { enqueueCheckin, enqueueCheckout } from "./queue";
import { pendingCounts, syncNow } from "./sync";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Server tiruan: idempoten terhadap client_id seperti API asli. */
function fakeServer() {
  const txs = new Map<string, Record<string, unknown>>();
  const uploaded = new Set<string>();
  const calls: string[] = [];
  let online = true;
  const handler: Handler = (url, init) => {
    if (!online) throw new TypeError("Failed to fetch");
    calls.push(`${init.method ?? "GET"} ${url}`);
    const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (url === "/api/transactions") {
      const existing = txs.get(body.client_id);
      if (existing) return json(existing, 200);
      const tx = { id: txs.size + 1, client_id: body.client_id, ticket_code: body.ticket_code, status: "parked" };
      txs.set(body.client_id, tx);
      return json(tx, 201);
    }
    const m = url.match(/^\/api\/transactions\/([^/]+)\/checkout$/);
    if (m) {
      const tx = txs.get(m[1]);
      if (!tx) return json({ detail: "Transaksi tidak ditemukan" }, 404);
      tx.status = body.has_new_damage ? "incident_pending" : "released";
      return json(tx);
    }
    if (url === "/api/uploads/presign")
      return json(body.photo_ids.map((id: string) => ({ photo_id: id, url: `https://s3.test/${id}`, uploaded: false, headers: {} })));
    if (url.startsWith("https://s3.test/")) {
      uploaded.add(url.split("/").pop()!);
      return new Response(null, { status: 200 });
    }
    if (url === "/api/uploads/complete") return json({ completed: body.photo_ids });
    return json({ detail: "?" }, 404);
  };
  return {
    txs, uploaded, calls,
    setOnline: (v: boolean) => (online = v),
    fetch: vi.fn(async (url: string, init: RequestInit = {}) => handler(url, init)),
  };
}

const USER = 7;
const photo = (side: string) => ({ id: crypto.randomUUID(), side, blob: new Blob(["jpeg"], { type: "image/jpeg" }) });

async function checkin(clientId = crypto.randomUUID()) {
  await enqueueCheckin({
    userId: USER, postId: 2,
    body: { client_id: clientId, plate: "B 1234 ABC", ticket_code: "CKL-2010-7K3PQ" },
    photos: [photo("depan"), photo("belakang")],
    display: { client_id: clientId, plate: "B 1234 ABC" },
  });
  return clientId;
}

describe("antrean offline (PRD §8)", () => {
  let server: ReturnType<typeof fakeServer>;

  beforeEach(async () => {
    await Promise.all([db.outbox.clear(), db.photos.clear(), db.txs.clear(), db.cache.clear()]);
    server = fakeServer();
    vi.stubGlobal("fetch", server.fetch);
  });

  it("mode pesawat: check in tersimpan di HP, terkirim saat online, tidak dobel", async () => {
    server.setOnline(false);
    const cid = await checkin();
    let r = await syncNow(USER);
    expect(r.stoppedBy).toBe("offline");
    expect((await pendingCounts(USER)).total).toBe(3); // 1 transaksi + 2 foto
    expect(server.txs.size).toBe(0);

    server.setOnline(true);
    r = await syncNow(USER);
    expect(r).toMatchObject({ sent: 1, uploaded: 2, failed: 0 });
    expect(server.txs.size).toBe(1);
    expect(server.uploaded.size).toBe(2);
    expect((await pendingCounts(USER)).total).toBe(0);
    expect((await db.txs.get(cid))?.synced).toBe(1);

    // Sinkron ulang tidak mengirim apa-apa lagi
    await syncNow(USER);
    expect(server.calls.filter((c) => c === "POST /api/transactions")).toHaveLength(1);
  });

  it("respons hilang di tengah jalan → kirim ulang aman karena idempoten", async () => {
    const cid = await checkin();
    // Server menerima, tapi respons tidak sampai ke HP
    let first = true;
    const original = server.fetch.getMockImplementation()!;
    server.fetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
      const res = await original(url, init);
      if (url === "/api/transactions" && first) {
        first = false;
        throw new TypeError("network lost");
      }
      return res;
    });
    expect((await syncNow(USER)).stoppedBy).toBe("offline");
    await syncNow(USER);
    expect(server.txs.size).toBe(1);
    expect(server.txs.get(cid)?.status).toBe("parked");
    expect((await pendingCounts(USER)).total).toBe(0);
  });

  it("check out offline dari check in offline dikirim berurutan", async () => {
    server.setOnline(false);
    const cid = await checkin();
    await enqueueCheckout({
      userId: USER, postId: 2, txClientId: cid,
      body: { client_id: crypto.randomUUID(), has_new_damage: false },
      photos: [photo("depan")],
      display: { status: "released" },
    });
    await syncNow(USER); // tunggu sinkron otomatis dari enqueue selesai (masih offline)
    expect((await db.txs.get(cid))?.state).toBe("checked_out");
    server.setOnline(true);
    const r = await syncNow(USER);
    expect(r.sent).toBe(2);
    expect(server.txs.get(cid)?.status).toBe("released");
    expect(server.uploaded.size).toBe(3);
  });

  it("ditolak server: data tidak dihapus dan check out lanjutannya ditahan", async () => {
    const original = server.fetch.getMockImplementation()!;
    server.fetch.mockImplementation(async (url: string, init: RequestInit = {}) =>
      url === "/api/transactions" ? json({ detail: "Plat B 1234 ABC masih tercatat parkir" }, 409) : original(url, init),
    );
    const cid = await checkin();
    await enqueueCheckout({
      userId: USER, postId: 2, txClientId: cid,
      body: { client_id: crypto.randomUUID(), has_new_damage: false }, photos: [], display: {},
    });
    const r = await syncNow(USER);
    expect(r.failed).toBe(1);
    const pending = await pendingCounts(USER);
    expect(pending.data).toBe(2);
    expect(pending.errors[0].last_error).toContain("masih tercatat parkir");
    expect(server.calls.some((c) => c.includes("/checkout"))).toBe(false);
  });

  it("data user lain tidak ikut dikirim", async () => {
    server.setOnline(false);
    await checkin();
    await syncNow(USER);
    server.setOnline(true);
    const r = await syncNow(999);
    expect(r.sent).toBe(0);
    expect(server.txs.size).toBe(0);
  });
});
