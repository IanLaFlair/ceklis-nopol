from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import token_digest
from app.core.timeutil import now
from app.models import ADMIN_ROLES, User, UserSession

COOKIE_NAME = "ceklis_session"

DB = Annotated[Session, Depends(get_db)]


def device_of(request: Request) -> str:
    dev = request.headers.get("x-device") or ""
    ua = request.headers.get("user-agent") or ""
    return f"{dev} · {ua}".strip(" ·")[:300]


def current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Belum masuk")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == token_digest(token)))
    t = now()
    if not sess or sess.expires_at < t or not sess.user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi berakhir, silakan masuk lagi")
    user = sess.user
    if not user.last_active_at or t - user.last_active_at > timedelta(minutes=5):
        user.last_active_at = t
        db.commit()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def admin_user(user: CurrentUser) -> User:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus admin / supervisor")
    return user


def manager_user(user: CurrentUser) -> User:
    """Mengubah lokasi, user, template: super_admin atau client_admin."""
    if user.role not in ("super_admin", "client_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus admin klien")
    return user


def staff_manager_user(user: CurrentUser) -> User:
    """Mengelola petugas: admin, atau supervisor per lokasi (hanya petugas di lokasinya)."""
    if user.role in ("super_admin", "client_admin") or (user.role == "supervisor" and user.site_id):
        return user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus admin / supervisor lokasi")


AdminUser = Annotated[User, Depends(admin_user)]
ManagerUser = Annotated[User, Depends(manager_user)]
StaffManagerUser = Annotated[User, Depends(staff_manager_user)]
