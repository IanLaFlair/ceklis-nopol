from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT_ENV, ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://ceklis:ceklis@localhost:5432/ceklis"
    redis_url: str = "redis://localhost:6379/0"
    session_secret: str = "dev-secret"
    session_cookie_secure: bool = True
    session_ttl_days: int = 14
    app_base_url: str = "https://ceklis.nopol-lpr.com"
    app_tz: str = "Asia/Jakarta"

    s3_endpoint: str = ""
    s3_public_endpoint: str = ""
    s3_bucket: str = "ceklis-photos"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    nopol_engine_url: str = ""
    nopol_engine_token: str = ""
    plate_confirm_threshold: float = 0.8

    photo_max_px: int = 1600
    photo_retention_days: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings()
