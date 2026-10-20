import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.services.plates import display_plate

router = APIRouter(prefix="/plates", tags=["plates"])

MAX_FRAME_BYTES = 2 * 1024 * 1024


@router.post("/scan")
async def scan_plate(user: CurrentUser, image: UploadFile = File(...)):
    """Satu frame kamera → engine Nopol (/v1/recognize). Gagal = petugas ketik manual (PRD §9)."""
    s = get_settings()
    # TODO(decision): engine Nopol khusus Ceklis di cloud atau engine di server klien (PRD §14)
    if not s.nopol_engine_url:
        raise HTTPException(503, "Scan plat belum diaktifkan. Ketik nomor polisi manual.")
    data = await image.read(MAX_FRAME_BYTES + 1)
    if len(data) > MAX_FRAME_BYTES:
        raise HTTPException(413, "Gambar terlalu besar")
    headers = {"Authorization": f"Bearer {s.nopol_engine_token}"} if s.nopol_engine_token else {}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(
                s.nopol_engine_url.rstrip("/") + "/v1/recognize",
                files={"image": (image.filename or "frame.jpg", data, image.content_type or "image/jpeg")},
                headers=headers,
            )
        r.raise_for_status()
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, "Engine scan plat tidak merespons. Ketik manual.") from e
    plate = (body.get("plate") or "").strip()
    if not plate:
        raise HTTPException(422, "Plat tidak terbaca. Coba lagi atau ketik manual.")
    confidence = float(body.get("confidence") or 0)
    return {
        "plate": display_plate(plate),
        "confidence": confidence,
        "needs_confirmation": confidence < s.plate_confirm_threshold,
    }
