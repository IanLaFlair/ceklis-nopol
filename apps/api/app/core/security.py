import hashlib
import secrets

import bcrypt


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
