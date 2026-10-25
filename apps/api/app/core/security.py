import hashlib
import secrets

import base64

import bcrypt
from cryptography.fernet import Fernet, InvalidToken


def hash_secret(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def verify_secret(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except ValueError:
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    # Hanya hash token yang disimpan di DB, supaya bocornya tabel sessions tidak bisa dipakai login.
    return hashlib.sha256(token.encode()).hexdigest()


def _pin_cipher() -> Fernet:
    from app.core.config import get_settings

    key = hashlib.sha256(f"ceklis-pin:{get_settings().session_secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_pin(pin: str) -> str:
    return _pin_cipher().encrypt(pin.encode()).decode()


def decrypt_pin(token: str | None) -> str | None:
    """None kalau tidak tersimpan atau SESSION_SECRET sudah diganti (PIN perlu di-reset)."""
    if not token:
        return None
    try:
        return _pin_cipher().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
