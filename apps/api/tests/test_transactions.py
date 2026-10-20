import uuid

from app.models import TemplateVersion
from app.services.template_config import STANDAR_MOBIL
from tests.conftest import (
    ALL_ITEMS,
    checkin_payload,
    checkout_payload,
    login_admin,
    login_petugas,
    photos,
)

# ---------- idempotensi client_id ----------

def test_checkin_idempoten_terhadap_client_id(world):
    c = login_petugas(world.budi)
    body = checkin_payload(world)
    r1 = c.post("/api/transactions", json=body)
    assert r1.status_code == 201, r1.text
    r2 = c.post("/api/transactions", json=body)
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    assert len(c.get("/api/transactions", params={"post_id": world.lobby2.id}).json()) == 1


def test_checkout_idempoten(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    body = checkout_payload()
    r1 = c.post(f"/api/transactions/{tx['id']}/checkout", json=body)
    r2 = c.post(f"/api/transactions/{tx['id']}/checkout", json=body)
    assert r1.status_code == r2.status_code == 200
    assert r2.json()["status"] == "released"
    # client_id berbeda = check out kedua → ditolak
    assert c.post(f"/api/transactions/{tx['id']}/checkout", json=checkout_payload()).status_code == 409


def test_transaksi_offline_dirujuk_pakai_uuid(world):
    c = login_petugas(world.budi)
    body = checkin_payload(world)
    c.post("/api/transactions", json=body)
    r = c.post(f"/api/transactions/{body['client_id']}/checkout", json=checkout_payload())
    assert r.status_code == 200 and r.json()["status"] == "released"


# ---------- aturan check in ----------

def test_satu_plat_parked_per_lokasi(world):
    c = login_petugas(world.budi)
    assert c.post("/api/transactions", json=checkin_payload(world, "B 1234 ABC")).status_code == 201
    r = c.post("/api/transactions", json=checkin_payload(world, "b1234abc"))
    assert r.status_code == 409
    assert "masih tercatat parkir" in r.json()["detail"]
    # Lokasi lain boleh
    asep = login_petugas(world.asep)
    assert asep.post("/api/transactions", json=checkin_payload(world, "B 1234 ABC", post_id=world.tsm_lobby.id)
                     ).status_code == 201


def test_foto_4_sisi_wajib(world):
    c = login_petugas(world.budi)
    r = c.post("/api/transactions", json=checkin_payload(world, photos=photos("depan", "kiri")))
    assert r.status_code == 422
    assert "belakang" in r.json()["detail"]


def test_item_tidak_diceklis_wajib_foto_dan_catatan(world):
    c = login_petugas(world.budi)
    checks = [{"item_id": i, "checked": i != "bamper_belakang"} for i in ALL_ITEMS]
    assert c.post("/api/transactions", json=checkin_payload(world, checks=checks)).status_code == 422

    checks[-5] = {"item_id": "bamper_belakang", "checked": False, "note": "lecet kiri"}
    ph = photos() + [{"client_id": str(uuid.uuid4()), "side": "detail", "item_id": "bamper_belakang"}]
    r = c.post("/api/transactions", json=checkin_payload(world, checks=checks, photos=ph))
    assert r.status_code == 201, r.text
    assert "Bodi belakang: Perlu dicek (bamper belakang)" in r.json()["summary_text"]


def test_tiket_cek_list_dari_hp_dipakai_kalau_valid(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world, ticket_code="CKL-2010-7K3PQ")).json()
    assert tx["ticket_code"] == "CKL-2010-7K3PQ"
    # Bentrok → server buat kode baru
    tx2 = c.post("/api/transactions", json=checkin_payload(world, "L 1802 NA", ticket_code="CKL-2010-7K3PQ")).json()
    assert tx2["ticket_code"].startswith("CKL-") and tx2["ticket_code"] != "CKL-2010-7K3PQ"
    assert c.get("/api/tickets/ckl-2010-7k3pq").json()["id"] == tx["id"]


# ---------- snapshot template ----------

def test_snapshot_template_tidak_berubah_saat_template_diubah(world, db):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()

    admin = login_admin("ops@x.id", "rahasia-ops")
    cfg = STANDAR_MOBIL.model_dump(mode="json")
    cfg["groups"][0]["items"][2]["label"] = "Bumper depan (baru)"
    r = admin.put(f"/api/admin/templates/{world.template.id}", json={"config": cfg})
    assert r.status_code == 403  # template global hanya super admin
    root = login_admin("root@x.id", "rahasia-root")
    r = root.put(f"/api/admin/templates/{world.template.id}", json={"config": cfg})
    assert r.status_code == 200 and r.json()["version"] == 2
    assert db.query(TemplateVersion).count() == 2

    detail = c.get(f"/api/transactions/{tx['id']}").json()
    assert detail["template_version_id"] == world.version_id
    labels = {ch["item_id"]: ch["label"] for ch in detail["checks"]}
    assert labels["bamper_depan"] == "Bamper depan"
    assert detail["template"]["groups"][0]["items"][2]["label"] == "Bamper depan"
    # Check in berikutnya memakai versi baru
    assert c.get("/api/me/assignment").json()["template"]["version"] == 2


def test_simpan_tanpa_perubahan_tidak_menambah_versi(world):
    root = login_admin("root@x.id", "rahasia-root")
    r = root.put(f"/api/admin/templates/{world.template.id}", json={"config": STANDAR_MOBIL.model_dump(mode="json")})
    assert r.json()["version"] == 1


# ---------- state machine ----------

def test_checkout_tanpa_kerusakan_released(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    r = c.post(f"/api/transactions/{tx['id']}/checkout", json=checkout_payload())
    d = r.json()
    assert d["status"] == "released" and d["checkout_at"] and d["released_at"]


def test_checkout_foto_keluar_wajib(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    r = c.post(f"/api/transactions/{tx['id']}/checkout", json=checkout_payload(photos=photos("depan")))
    assert r.status_code == 422


def _incident_checkout(c, tx_id):
    body = checkout_payload(has_new_damage=True, incident={
        "client_id": str(uuid.uuid4()), "parts": ["Pintu depan kiri"], "note": "goresan memanjang",
        "photos": [{"client_id": str(uuid.uuid4()), "side": "detail"}],
    })
    return c.post(f"/api/transactions/{tx_id}/checkout", json=body)


def test_kerusakan_baru_menunggu_supervisor_lalu_tidak_ada(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    d = _incident_checkout(c, tx["id"]).json()
    assert d["status"] == "incident_pending"
    inc = d["incidents"][0]
    assert inc["code"].startswith("INS-") and inc["status"] == "pending"

    # Petugas tidak boleh memutuskan
    assert c.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "no_damage"}).status_code == 403
    # Tidak bisa diserahkan sebelum diputuskan
    assert c.post(f"/api/transactions/{tx['id']}/release").status_code == 409

    spv = login_admin("hendra@x.id", "rahasia-spv")
    r = spv.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "no_damage", "note": "dicek bersama"})
    assert r.status_code == 200
    assert r.json()["status"] == "dismissed"
    assert r.json()["transaction"]["status"] == "released"


def test_kerusakan_dikonfirmasi_lalu_diserahkan(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    inc = _incident_checkout(c, tx["id"]).json()["incidents"][0]
    spv = login_admin("hendra@x.id", "rahasia-spv")
    r = spv.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "damage_confirmed"})
    assert r.json()["transaction"]["status"] == "incident_confirmed"
    # Keputusan kedua yang berbeda ditolak, yang sama idempoten
    assert spv.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "no_damage"}).status_code == 409
    assert spv.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "damage_confirmed"}).status_code == 200
    r = c.post(f"/api/transactions/{tx['id']}/release")
    assert r.status_code == 200 and r.json()["status"] == "released"


def test_supervisor_pos_lain_tidak_bisa_memutuskan(world):
    rina = login_petugas(world.rina)  # Lobby 1, Hendra hanya supervisor Lobby 2
    tx = rina.post("/api/transactions", json=checkin_payload(world, post_id=world.lobby1.id)).json()
    inc = _incident_checkout(rina, tx["id"]).json()["incidents"][0]
    spv = login_admin("hendra@x.id", "rahasia-spv")
    assert spv.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "no_damage"}).status_code == 404
    ops = login_admin("ops@x.id", "rahasia-ops")
    assert ops.post(f"/api/incidents/{inc['id']}/decision", json={"decision": "no_damage"}).status_code == 200


def test_transisi_tidak_sah_ditolak():
    import pytest

    from app.models import Transaction
    from app.services.transactions import ServiceError, _transition

    tx = Transaction(status="released")
    with pytest.raises(ServiceError):
        _transition(tx, "parked")
    tx.status = "parked"
    with pytest.raises(ServiceError):
        _transition(tx, "incident_confirmed")


# ---------- izin per peran ----------

def test_petugas_tidak_bisa_lihat_pos_lain(world):
    rina = login_petugas(world.rina)
    tx = rina.post("/api/transactions", json=checkin_payload(world, post_id=world.lobby1.id)).json()
    budi = login_petugas(world.budi)
    assert budi.get(f"/api/transactions/{tx['id']}").status_code == 404
    assert budi.get("/api/transactions", params={"post_id": world.lobby1.id}).status_code == 403
    assert budi.get("/api/transactions").json() == []
    assert budi.get(f"/api/tickets/{tx['ticket_code']}").status_code == 404
    assert budi.post(f"/api/transactions/{tx['id']}/checkout", json=checkout_payload()).status_code == 404
    # Tidak bisa check in ke pos yang bukan tugasnya
    assert budi.post("/api/transactions", json=checkin_payload(world, post_id=world.lobby1.id)).status_code == 403


def test_admin_klien_hanya_lihat_kliennya(world):
    asep = login_petugas(world.asep)
    asep.post("/api/transactions", json=checkin_payload(world, post_id=world.tsm_lobby.id))
    budi = login_petugas(world.budi)
    budi.post("/api/transactions", json=checkin_payload(world, "L 1 A"))
    ops = login_admin("ops@x.id", "rahasia-ops")
    items = ops.get("/api/admin/transactions").json()["items"]
    assert [t["plate"] for t in items] == ["L 1 A"]
    assert ops.get("/api/admin/stats", params={"scope": f"site:{world.other_site.id}"}).json()["kpi"]["parked"] == 0
    root = login_admin("root@x.id", "rahasia-root")
    assert root.get("/api/admin/stats").json()["kpi"]["parked"] == 2


def test_upload_presign_hanya_untuk_foto_sendiri(world, monkeypatch):
    from app.services import storage

    monkeypatch.setattr(storage, "object_exists", lambda key: True)
    budi = login_petugas(world.budi)
    body = checkin_payload(world)
    tx = budi.post("/api/transactions", json=body).json()
    assert tx["photos_complete"] is False
    ids = [p["client_id"] for p in body["photos"]]
    signed = budi.post("/api/uploads/presign", json={"photo_ids": ids}).json()
    assert all(s["url"] and "X-Amz-Signature" in s["url"] for s in signed)
    rina = login_petugas(world.rina)
    assert rina.post("/api/uploads/presign", json={"photo_ids": ids}).status_code == 403
    assert budi.post("/api/uploads/complete", json={"photo_ids": ids}).status_code == 200
    assert budi.get(f"/api/transactions/{tx['id']}").json()["photos_complete"] is True
