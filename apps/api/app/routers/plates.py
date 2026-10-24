from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.services import nopol
from app.services.plates import display_plate

router = APIRouter(prefix="/plates", tags=["plates"])

MAX_FRAME_BYTES = 2 * 1024 * 1024


@router.post("/scan")
async def scan_plate(user: CurrentUser, image: UploadFile = File(...)):
    """Satu frame kamera → API Nopol. Gagal = petugas ketik manual (PRD §9)."""
    if not nopol.configured():
        raise HTTPException(503, "Scan plat belum diaktifkan. Ketik nomor polisi manual.")
    data = await image.read(MAX_FRAME_BYTES + 1)
    if len(data) > MAX_FRAME_BYTES:
        raise HTTPException(413, "Gambar terlalu besar")
    try:
        rec = await nopol.client.recognize(data, image.filename or "frame.jpg", image.content_type or "image/jpeg")
    except nopol.NopolError as e:
        raise HTTPException(e.status, e.detail) from e
    return {
        "plate": display_plate(rec.plate),
        "confidence": rec.confidence,
        "needs_confirmation": rec.confidence < get_settings().plate_confirm_threshold,
    }
