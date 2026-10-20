"""Worker arq: `arq app.jobs.worker.WorkerSettings`."""
import io
import logging
from datetime import timedelta

from arq import cron
from arq.connections import RedisSettings
from PIL import Image, ImageOps
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.timeutil import now
from app.models import Photo
from app.services import storage

log = logging.getLogger(__name__)
THUMB_PX = 480


def _thumb_key(key: str) -> str:
    return "thumb/" + key


async def make_thumbnail(ctx, photo_id: int) -> str | None:
    s = get_settings()
    with SessionLocal() as db:
        photo = db.get(Photo, photo_id)
        if not photo or photo.thumb_key:
            return None
        c = storage.internal_client()
        raw = c.get_object(Bucket=s.s3_bucket, Key=photo.object_key)["Body"].read()
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        img.thumbnail((THUMB_PX, THUMB_PX))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=70)
        key = _thumb_key(photo.object_key)
        c.put_object(Bucket=s.s3_bucket, Key=key, Body=buf.getvalue(), ContentType="image/jpeg")
        photo.thumb_key = key
        db.commit()
        return key


async def purge_old_photos(ctx) -> int:
    # TODO(decision): retensi foto & siapa yang boleh unduh (PRD §14). Default: PHOTO_RETENTION_DAYS.
    s = get_settings()
    cutoff = now() - timedelta(days=s.photo_retention_days)
    removed = 0
    with SessionLocal() as db:
        photos = db.scalars(select(Photo).where(Photo.taken_at < cutoff, Photo.uploaded_at.is_not(None),
                                                Photo.deleted_at.is_(None))
                            .limit(1000)).all()
        c = storage.internal_client()
        for p in photos:
            for key in filter(None, (p.object_key, p.thumb_key)):
                c.delete_object(Bucket=s.s3_bucket, Key=key)
            p.deleted_at = now()
            removed += 1
        db.commit()
    log.info("purge_old_photos: %s foto dihapus", removed)
    return removed


class WorkerSettings:
    functions = [make_thumbnail, purge_old_photos]
    cron_jobs = [cron(purge_old_photos, hour=3, minute=15)]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
