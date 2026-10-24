from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env di root monorepo (dev). Di container path ini tidak ada; env datang dari docker compose.
_parents = Path(__file__).resolve().parents
ROOT_ENV = _parents[4] / ".env" if len(_parents) > 4 else Path(".env")


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

    # Scan plat lewat engine Nopol (PRD §9). Kosong = scan mati.
    # Engine lokal/on-prem: URL engine + /recognize, tanpa login. API cloud: isi token atau akun.
    nopol_api_url: str = ""
    nopol_recognize_path: str = "/recognize"
    nopol_api_token: str = ""
    nopol_email: str = ""
    nopol_password: str = ""
    # Confidence engine cenderung terlalu yakin (bacaan salah bisa 0.86–0.96); di bawah ini petugas diminta cek ulang
    plate_confirm_threshold: float = 0.97

    photo_max_px: int = 1600
    photo_retention_days: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings()
