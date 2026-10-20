"""Enqueue job arq. Kalau Redis mati, job dilewati (thumbnail bukan bagian kritis alur petugas)."""
import logging

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings

log = logging.getLogger(__name__)
_pool: ArqRedis | None = None


async def enqueue(name: str, *args) -> None:
    global _pool
    try:
        if _pool is None:
            _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url),
                                      conn_timeout=1, conn_retries=0)
        await _pool.enqueue_job(name, *args)
    except Exception as e:  # noqa: BLE001
        log.warning("enqueue %s gagal: %s", name, e)
        _pool = None
