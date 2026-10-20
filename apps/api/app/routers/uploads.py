from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.timeutil import now
from app.jobs.queue import enqueue
from app.models import Photo
from app.schemas.transactions import CompleteRequest, PresignRequest
from app.services import scope, storage

router = APIRouter(prefix="/uploads", tags=["uploads"])


def _photos(db, user, ids) -> list[Photo]:
    photos = list(db.scalars(select(Photo).where(Photo.client_id_uuid.in_(ids))))
    if len(photos) != len(set(ids)):
        raise HTTPException(404, "Foto belum terdaftar. Kirim transaksinya dulu.")
    for p in photos:
        if not scope.can_access_post(db, user, p.transaction.post_id):
            raise HTTPException(403, "Bukan foto dari pos kamu")
    return photos


@router.post("/presign")
def presign(body: PresignRequest, user: CurrentUser, db: DB):
    """Presigned PUT URL per foto. Foto diunggah langsung dari HP ke storage."""
    return [{
        "photo_id": str(p.client_id_uuid), "object_key": p.object_key, "uploaded": p.uploaded_at is not None,
        "url": None if p.uploaded_at else storage.presign_put(p.object_key),
        "headers": {"Content-Type": "image/jpeg"},
    } for p in _photos(db, user, body.photo_ids)]


@router.post("/complete")
async def complete(body: CompleteRequest, user: CurrentUser, db: DB):
    done = []
    for p in _photos(db, user, body.photo_ids):
        if p.uploaded_at:
            done.append(str(p.client_id_uuid))
            continue
        if storage.object_exists(p.object_key) is False:
            raise HTTPException(409, f"Foto {p.client_id_uuid} belum ada di storage")
        p.uploaded_at = now()
        done.append(str(p.client_id_uuid))
        db.commit()
        await enqueue("make_thumbnail", p.id)
    return {"completed": done}
