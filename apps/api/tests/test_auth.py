from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import PIN, login_admin, login_petugas


def test_login_petugas_dengan_hp_atau_id(world):
    c = login_petugas(world.budi)
    assert c.get("/api/me").json()["name"] == "Budi"
    c2 = TestClient(app)
    assert c2.post("/api/auth/petugas/login", json={"login": "ptg-0001", "pin": PIN}).status_code == 200
    # Format +62 juga diterima
    c3 = TestClient(app)
    assert c3.post("/api/auth/petugas/login", json={"login": "+62 811-1111-1111", "pin": PIN}).status_code == 200


def test_pin_salah_dan_lockout(world):
    c = TestClient(app)
    for _ in range(5):
        assert c.post("/api/auth/petugas/login", json={"login": world.budi.phone, "pin": "000000"}).status_code == 401
    r = c.post("/api/auth/petugas/login", json={"login": world.budi.phone, "pin": PIN})
    assert r.status_code == 429


def test_cookie_httponly_dan_logout(world):
    c = TestClient(app)
    r = c.post("/api/auth/petugas/login", json={"login": world.budi.phone, "pin": PIN})
    assert "httponly" in r.headers["set-cookie"].lower()
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/me").status_code == 401


def test_admin_login_dan_petugas_tidak_bisa_admin(world):
    c = login_admin("ops@x.id", "rahasia-ops")
    assert c.get("/api/admin/stats").status_code == 200
    p = login_petugas(world.budi)
    assert p.get("/api/admin/stats").status_code == 403
    bad = TestClient(app)
    assert bad.post("/api/auth/admin/login", json={"email": "ops@x.id", "password": "salah"}).status_code == 401


def test_ganti_pin(world):
    c = login_petugas(world.budi)
    assert c.post("/api/auth/pin", json={"old_pin": PIN, "new_pin": "135792"}).status_code == 204
    fresh = TestClient(app)
    assert fresh.post("/api/auth/petugas/login", json={"login": world.budi.phone, "pin": "135792"}).status_code == 200


def test_assignment_berisi_template(world):
    c = login_petugas(world.budi)
    a = c.get("/api/me/assignment").json()
    assert a["active"]["post"]["name"] == "Lobby 2"
    assert a["template"]["version_id"] == world.version_id
    assert a["supervisors"][0]["name"] == "Hendra"
