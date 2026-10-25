from tests.conftest import checkin_payload, checkout_payload, login_admin, login_petugas


def test_admin_bikin_lokasi_pos_dan_menugaskan_petugas(world):
    ops = login_admin("ops@x.id", "rahasia-ops")
    site = ops.post("/api/admin/sites", json={"client_id": world.client.id, "name": "Pakuwon City Mall",
                                              "template_id": world.template.id}).json()
    posts = [ops.post("/api/admin/posts", json={"site_id": site["id"], "name": f"Lobby {i}"}).json()
             for i in range(1, 7)]
    assert len(posts) == 6
    invited = ops.post("/api/admin/users", json={"name": "Dian", "role": "petugas", "phone": "0812 0000 0001"}).json()
    assert len(invited["pin"]) == 6 and invited["staff_code"].startswith("PTG-")
    r = ops.post("/api/admin/assignments", json={"user_id": invited["id"], "post_id": posts[2]["id"],
                                                 "shift_start": "07:00", "shift_end": "15:00"})
    assert r.status_code == 201 and r.json()["shift"] == "Shift pagi · 07.00–15.00"

    from fastapi.testclient import TestClient

    from app.main import app
    dian = TestClient(app)
    r = dian.post("/api/auth/petugas/login", json={"login": "081200000001", "pin": invited["pin"]})
    assert r.status_code == 200
    assert dian.get("/api/me/assignment").json()["active"]["post"]["name"] == "Lobby 3"

    overview = ops.get(f"/api/admin/sites/{site['id']}/overview").json()
    assert [p["name"] for p in overview["posts"]] == [f"Lobby {i}" for i in range(1, 7)]
    assert overview["staff"][0]["user"]["name"] == "Dian"


def test_admin_klien_tidak_bisa_ubah_klien_lain(world):
    ops = login_admin("ops@x.id", "rahasia-ops")
    assert ops.post("/api/admin/sites", json={"client_id": world.other_client.id, "name": "Mall X"}).status_code == 403
    body = {"name": "Zaki", "role": "super_admin", "email": "z@x.id"}
    assert ops.post("/api/admin/users", json=body).status_code == 403


def test_stats_dan_laporan(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    c.post(f"/api/transactions/{tx['id']}/checkout", json=checkout_payload())
    c.post("/api/transactions", json=checkin_payload(world, "L 1802 NA"))
    ops = login_admin("ops@x.id", "rahasia-ops")
    s = ops.get("/api/admin/stats").json()
    assert s["kpi"] == {"parked": 1, "in_today": 2, "out_today": 1, "open_incidents": 0,
                        "avg_duration_minutes": 0}
    assert sum(h["in"] for h in s["hourly"]) == 2
    assert s["rows"][0]["name"] == "Pakuwon Mall Surabaya" and s["rows"][0]["parked"] == 1
    assert s["activity"][0]["plate"] == "L 1802 NA"

    counts = ops.get("/api/admin/transactions").json()["counts"]
    assert counts == {"all": 2, "parked": 1, "done": 1, "incident": 0}

    csv = ops.get("/api/admin/reports/transactions.csv")
    assert csv.status_code == 200 and "Kondisi (selain mulus)" in csv.text and "B 1234 ABC" in csv.text
    pdf = ops.get("/api/admin/reports/summary.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_riwayat_petugas(world):
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    c.post(f"/api/transactions/{tx['id']}/checkout", json=checkout_payload())
    h = c.get("/api/me/history", params={"period": "today"}).json()
    assert h["summary"] == {"checkin": 1, "checkout": 1, "incident": 0}
    assert {e["kind"] for e in h["events"]} == {"in", "out"}


def test_ubah_dan_hapus_klien(world):
    root = login_admin("root@x.id", "rahasia-root")
    c = root.post("/api/admin/clients", json={"name": "Margo Cty"}).json()
    assert root.patch(f"/api/admin/clients/{c['id']}", json={"name": "Margo City"}).json()["name"] == "Margo City"
    # Klien yang masih punya lokasi tidak bisa dihapus
    assert root.delete(f"/api/admin/clients/{world.client.id}").status_code == 409
    ops = login_admin("ops@x.id", "rahasia-ops")
    assert ops.delete(f"/api/admin/clients/{c['id']}").status_code == 403
    assert root.delete(f"/api/admin/clients/{c['id']}").status_code == 204
    assert all(x["id"] != c["id"] for x in root.get("/api/admin/clients").json())


def test_template_global_hanya_tampilkan_lokasi_klien_sendiri(world):
    ops = login_admin("ops@x.id", "rahasia-ops")
    tpl = next(t for t in ops.get("/api/admin/templates").json() if t["id"] == world.template.id)
    assert world.other_site.name not in [s["name"] for s in tpl["used_by"]]
    root = login_admin("root@x.id", "rahasia-root")
    tpl = next(t for t in root.get("/api/admin/templates").json() if t["id"] == world.template.id)
    assert world.other_site.name in [s["name"] for s in tpl["used_by"]]


def test_admin_bisa_lihat_pin_petugas_kapan_saja(world):
    ops = login_admin("ops@x.id", "rahasia-ops")
    u = ops.post("/api/admin/users", json={"name": "Udin", "role": "petugas", "phone": "0829 100 291"}).json()
    assert ops.get(f"/api/admin/users/{u['id']}/pin").json()["pin"] == u["pin"]
    # Setelah petugas ganti PIN, admin melihat PIN yang baru
    from fastapi.testclient import TestClient

    from app.main import app
    udin = TestClient(app)
    udin.post("/api/auth/petugas/login", json={"login": "0829100291", "pin": u["pin"]})
    assert udin.post("/api/auth/pin", json={"old_pin": u["pin"], "new_pin": "135792"}).status_code == 204
    assert ops.get(f"/api/admin/users/{u['id']}/pin").json()["pin"] == "135792"
    # PIN lama (sebelum fitur ini) tidak tersimpan: minta reset
    assert ops.get(f"/api/admin/users/{world.budi.id}/pin").status_code == 409
    # Admin klien lain tidak boleh melihat
    assert ops.get(f"/api/admin/users/{world.asep.id}/pin").status_code == 403


def test_supervisor_per_lokasi_lihat_semua_pos_di_dashboard(world):
    ops = login_admin("ops@x.id", "rahasia-ops")
    lobby2 = ops.post("/api/admin/posts", json={"site_id": world.site.id, "name": "Lobby 2"}).json()
    body = {"name": "Monica", "role": "supervisor", "email": "monica@x.id", "password": "rahasia-monica",
            "site_id": world.site.id}
    u = ops.post("/api/admin/users", json=body).json()
    assert u["pin"] is None and u["site_id"] == world.site.id
    # Lokasi klien lain ditolak
    assert ops.post("/api/admin/users", json={**body, "email": "m2@x.id", "site_id": world.other_site.id}).status_code == 403

    # Transaksi di pos lain pada lokasi yang sama tetap terlihat oleh supervisor
    c = login_petugas(world.budi)
    tx = c.post("/api/transactions", json=checkin_payload(world)).json()
    monica = login_admin("monica@x.id", "rahasia-monica")
    assert [s["id"] for s in monica.get("/api/admin/sites").json()] == [world.site.id]
    ids = [t["id"] for t in monica.get("/api/admin/transactions").json()["items"]]
    assert tx["id"] in ids
    ov = monica.get(f"/api/admin/sites/{world.site.id}/overview").json()
    assert {p["id"] for p in ov["posts"]} >= {lobby2["id"]}
    row = next(r for r in ov["staff"] if r["user"]["name"] == "Monica")
    assert row["posts"] == ["Semua pos"]
    assert monica.get(f"/api/admin/sites/{world.other_site.id}/overview").status_code in (403, 404)
