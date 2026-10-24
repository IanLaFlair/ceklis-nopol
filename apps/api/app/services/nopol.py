"""Klien engine Nopol untuk scan plat (PRD §9).

- Engine Nopol (lokal / server klien): POST {NOPOL_API_URL}/recognize, tanpa login.
- API cloud Nopol: NOPOL_API_TOKEN → header `Authorization: Bearer …`, atau NOPOL_EMAIL + NOPOL_PASSWORD →
  login ke /api/auth/login, cookie sesi disimpan di proses dan login ulang otomatis sekali kalau dapat 401.
"""
import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings

PLATE_KEYS = ("plate", "plate_number", "license_plate", "nopol", "number", "text")
CONF_KEYS = ("confidence", "score", "conf", "probability")


class NopolError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Recognition:
    plate: str
    confidence: float
    raw: dict


def configured() -> bool:
    return bool(get_settings().nopol_api_url)


def _uses_login() -> bool:
    s = get_settings()
    return not s.nopol_api_token and bool(s.nopol_email and s.nopol_password)


def _candidates(node: Any) -> list[tuple[str, float]]:
    """Cari semua pasangan (plat, keyakinan) di respons yang bentuknya belum pasti."""
    found: list[tuple[str, float]] = []
    if isinstance(node, dict):
        plate = next((node[k] for k in PLATE_KEYS if isinstance(node.get(k), str) and node[k].strip()), None)
        if plate:
            conf = next((node[k] for k in CONF_KEYS if isinstance(node.get(k), (int, float))), None)
            if conf is not None and conf > 1:  # persen → 0..1
                conf = conf / 100
            found.append((plate.strip(), float(conf) if conf is not None else 0.0))
        for v in node.values():
            if isinstance(v, (dict, list)):
                found += _candidates(v)
    elif isinstance(node, list):
        for v in node:
            found += _candidates(v)
    return found


# Status engine Nopol /recognize (selain "success" tidak ada confidence; plate = "Plate Unreadable")
UNREADABLE = {"plate_not_detected", "plate_unreadable"}


def parse(body: dict) -> Recognition | None:
    status = body.get("status")
    if status is not None and status != "success":
        return None
    cands = _candidates(body.get("result", body))
    if not cands:
        return None
    plate, conf = max(cands, key=lambda c: c[1])
    return Recognition(plate=plate, confidence=conf, raw=body)


class NopolClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self._transport = transport
        self._cookies = httpx.Cookies()
        self._lock = asyncio.Lock()

    def _client(self) -> httpx.AsyncClient:
        s = get_settings()
        headers = {"Authorization": f"Bearer {s.nopol_api_token}"} if s.nopol_api_token else {}
        return httpx.AsyncClient(base_url=s.nopol_api_url.rstrip("/"), headers=headers, cookies=self._cookies,
                                 timeout=10, transport=self._transport)

    async def _login(self, client: httpx.AsyncClient) -> None:
        s = get_settings()
        r = await client.post("/api/auth/login", json={"email": s.nopol_email, "password": s.nopol_password})
        if r.status_code != 200:
            raise NopolError(502, "Login ke Nopol gagal. Cek NOPOL_EMAIL / NOPOL_PASSWORD.")
        self._cookies.update(r.cookies)

    async def recognize(self, image: bytes, filename: str, content_type: str) -> Recognition:
        s = get_settings()
        use_login = _uses_login()
        try:
            async with self._client() as client:
                for attempt in (1, 2):
                    if use_login and (attempt == 2 or not self._cookies):
                        async with self._lock:
                            await self._login(client)
                    r = await client.post(s.nopol_recognize_path, files={"image": (filename, image, content_type)},
                                          data={"vehicle": "mobil"})
                    if r.status_code == 401 and use_login and attempt == 1:
                        self._cookies.clear()
                        continue
                    break
        except httpx.HTTPError as e:
            raise NopolError(502, "Engine scan plat tidak merespons. Ketik manual.") from e
        if r.status_code == 401:
            raise NopolError(502, "Akses ke Nopol ditolak. Cek kredensial NOPOL_* di server.")
        if r.status_code in (402, 403):
            # not_activated / subscription_inactive / license_offline_expired
            raise NopolError(503, "Lisensi engine scan plat tidak aktif. Ketik manual dan hubungi admin.")
        if r.status_code == 400:
            raise NopolError(422, "Foto tidak bisa dibaca. Coba foto ulang atau ketik manual.")
        if r.status_code >= 400:
            raise NopolError(502, f"Engine scan plat menolak permintaan ({r.status_code}). Ketik manual.")
        try:
            body = r.json()
        except ValueError as e:
            raise NopolError(502, "Balasan engine scan plat tidak terbaca. Ketik manual.") from e
        rec = parse(body)
        if not rec:
            raise NopolError(422, "Plat tidak terbaca. Coba lagi atau ketik manual.")
        return rec


client = NopolClient()
