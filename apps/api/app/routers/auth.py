import time
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.core.config import get_settings
from app.core.deps import COOKIE_NAME, DB, CurrentUser, device_of
from app.core.security import hash_secret, new_session_token, token_digest, verify_secret
from app.core.timeutil import now
from app.models import ADMIN_ROLES, User, UserSession
from app.routers.me import user_out
from app.services import activity
from app.services.plates import normalize_phone

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILS = 5
LOCK_SECONDS = 5 * 60
# TODO: pindah ke Redis kalau API dijalankan lebih dari satu proses
_fails: dict[str, list[float]] = defaultdict(list)


def _check_lock(key: str) -> None:
    recent = [t for t in _fails[key] if time.monotonic() - t < LOCK_SECONDS]
    _fails[key] = recent
    if len(recent) >= MAX_FAILS:
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi 5 menit lagi.")


class PetugasLogin(BaseModel):
    login: str = Field(min_length=3, max_length=40, description="ID petugas atau nomor HP")
    pin: str = Field(pattern=r"^\d{6}$")


class AdminLogin(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


def _start_session(db, user: User, request: Request, response: Response) -> None:
    s = get_settings()
    token = new_session_token()
    db.add(UserSession(token_hash=token_digest(token), user_id=user.id, device=device_of(request),
                       expires_at=now() + timedelta(days=s.session_ttl_days)))
    user.last_active_at = now()
    activity.log(db, user, "login", "user", user.id, device=device_of(request))
    db.commit()
    response.set_cookie(COOKIE_NAME, token, max_age=s.session_ttl_days * 86400, httponly=True,
                        secure=s.session_cookie_secure, samesite="lax", path="/")


@router.post("/petugas/login")
def petugas_login(body: PetugasLogin, request: Request, response: Response, db: DB):
    raw = body.login.strip()
    key = f"p:{raw.upper()}"
    _check_lock(key)
    phone = normalize_phone(raw)
    user = db.scalar(select(User).where(
        User.active.is_(True), User.role.in_(("petugas", "supervisor")),
        or_(User.staff_code == raw.upper(), User.phone == phone) if phone else User.staff_code == raw.upper(),
    ))
    if not user or not verify_secret(body.pin, user.pin_hash):
        _fails[key].append(time.monotonic())
        raise HTTPException(401, "ID/nomor HP atau PIN salah")
    _fails.pop(key, None)
    _start_session(db, user, request, response)
    return user_out(user)


@router.post("/admin/login")
def admin_login(body: AdminLogin, request: Request, response: Response, db: DB):
    email = body.email.strip().lower()
    key = f"a:{email}"
    _check_lock(key)
    user = db.scalar(select(User).where(User.email == email, User.active.is_(True), User.role.in_(ADMIN_ROLES)))
    if not user or not verify_secret(body.password, user.password_hash):
        _fails[key].append(time.monotonic())
        raise HTTPException(401, "Email atau password salah")
    _fails.pop(key, None)
    _start_session(db, user, request, response)
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DB):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        sess = db.scalar(select(UserSession).where(UserSession.token_hash == token_digest(token)))
        if sess:
            activity.log(db, sess.user, "logout", "user", sess.user_id, device=device_of(request))
            db.delete(sess)
            db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


class ChangePin(BaseModel):
    old_pin: str = Field(pattern=r"^\d{6}$")
    new_pin: str = Field(pattern=r"^\d{6}$")


@router.post("/pin", status_code=204)
def change_pin(body: ChangePin, user: CurrentUser, request: Request, db: DB):
    if not verify_secret(body.old_pin, user.pin_hash):
        raise HTTPException(400, "PIN lama salah")
    if body.new_pin == body.old_pin or len(set(body.new_pin)) == 1:
        raise HTTPException(400, "Pilih PIN baru yang berbeda dan tidak berulang")
    user.pin_hash = hash_secret(body.new_pin)
    activity.log(db, user, "pin_changed", "user", user.id, device=device_of(request))
    db.commit()


class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=200)


@router.post("/password", status_code=204)
def change_password(body: ChangePassword, user: CurrentUser, request: Request, db: DB):
    if not verify_secret(body.old_password, user.password_hash):
        raise HTTPException(400, "Password lama salah")
    user.password_hash = hash_secret(body.new_password)
    activity.log(db, user, "password_changed", "user", user.id, device=device_of(request))
    db.commit()
