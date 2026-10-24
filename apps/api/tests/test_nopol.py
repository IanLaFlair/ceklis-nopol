import httpx
import pytest

from app.core.config import get_settings
from app.services import nopol
from tests.conftest import login_petugas


@pytest.fixture
def nopol_env(monkeypatch):
    def set_env(**env):
        for k in ("NOPOL_API_TOKEN", "NOPOL_EMAIL", "NOPOL_PASSWORD"):
            monkeypatch.delenv(k, raising=False)
        monkeypatch.setenv("NOPOL_API_URL", "https://nopol.test")
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        get_settings.cache_clear()
    yield set_env
    get_settings.cache_clear()


class FakeNopol:
    """Server Nopol tiruan: login pakai cookie, recognize butuh cookie atau Bearer."""

    def __init__(self, result: dict, token: str = "kunci-uji"):
        self.result, self.token, self.calls, self.sessions = result, token, [], {"sesi-1"}

    def handler(self, req: httpx.Request) -> httpx.Response:
        self.calls.append(f"{req.method} {req.url.path}")
        if req.url.path == "/api/auth/login":
            return httpx.Response(200, json={"id": 1}, headers={"set-cookie": "nopol_session=sesi-1; Path=/"})
        if req.url.path == "/api/playground/recognize":
            cookie = req.headers.get("cookie", "")
            ok = req.headers.get("authorization") == f"Bearer {self.token}" or any(
                f"nopol_session={s}" in cookie for s in self.sessions)
            if not ok:
                return httpx.Response(401, json={"error": "not_authenticated"})
            assert b'name="image"' in req.content
            return httpx.Response(200, json={"result": self.result})
        return httpx.Response(404)


def use(fake: FakeNopol, monkeypatch):
    monkeypatch.setattr(nopol, "client", nopol.NopolClient(transport=httpx.MockTransport(fake.handler)))


def scan(c):
    return c.post("/api/plates/scan", files={"image": ("frame.jpg", b"jpeg", "image/jpeg")})


def test_belum_dikonfigurasi_503(world, nopol_env):
    nopol_env()
    r = scan(login_petugas(world.budi))
    assert r.status_code == 503 and "manual" in r.json()["detail"]


def test_api_key_bearer(world, nopol_env, monkeypatch):
    nopol_env(NOPOL_API_TOKEN="kunci-uji")
    fake = FakeNopol({"plates": [{"plate": "B1234ABC", "confidence": 0.97}]})
    use(fake, monkeypatch)
    r = scan(login_petugas(world.budi))
    assert r.status_code == 200, r.text
    assert r.json() == {"plate": "B 1234 ABC", "confidence": 0.97, "needs_confirmation": False}
    assert "POST /api/auth/login" not in fake.calls


def test_login_akun_lalu_login_ulang_saat_sesi_habis(world, nopol_env, monkeypatch):
    nopol_env(NOPOL_EMAIL="ceklis@nopol.test", NOPOL_PASSWORD="rahasia")
    fake = FakeNopol({"plate": "L 1802 NA", "score": 72})
    use(fake, monkeypatch)
    c = login_petugas(world.budi)
    r = scan(c)
    assert r.json() == {"plate": "L 1802 NA", "confidence": 0.72, "needs_confirmation": True}
    assert fake.calls.count("POST /api/auth/login") == 1
    scan(c)
    assert fake.calls.count("POST /api/auth/login") == 1  # sesi dipakai ulang
    fake.sessions = {"sesi-2"}  # sesi lama kedaluwarsa di Nopol
    original = fake.handler

    def relogin(req):
        if req.url.path == "/api/auth/login":
            fake.calls.append("POST /api/auth/login")
            return httpx.Response(200, json={"id": 1}, headers={"set-cookie": "nopol_session=sesi-2; Path=/"})
        return original(req)

    nopol.client._transport = httpx.MockTransport(relogin)
    assert scan(c).status_code == 200
    assert fake.calls.count("POST /api/auth/login") == 2


def test_kredensial_salah_dan_plat_tidak_terbaca(world, nopol_env, monkeypatch):
    nopol_env(NOPOL_API_TOKEN="salah")
    use(FakeNopol({"plate": "B 1 A", "confidence": 0.9}), monkeypatch)
    c = login_petugas(world.budi)
    assert scan(c).status_code == 502
    nopol_env(NOPOL_API_TOKEN="kunci-uji")
    use(FakeNopol({"vehicles": []}), monkeypatch)
    r = scan(c)
    assert r.status_code == 422 and "tidak terbaca" in r.json()["detail"]


def test_parse_memilih_keyakinan_tertinggi():
    body = {"result": {"detections": [{"text": "B 1 A", "conf": 0.4}, {"text": "B 1234 ABC", "conf": 0.91}]}}
    rec = nopol.parse(body)
    assert rec.plate == "B 1234 ABC" and rec.confidence == 0.91
