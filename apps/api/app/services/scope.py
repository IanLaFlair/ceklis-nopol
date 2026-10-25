"""Scope data per peran & penugasan (PRD §3). Petugas hanya melihat pos-nya sendiri."""
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.timeutil import today
from app.models import Assignment, Post, Site, User


def _valid_on(d: date):
    return (
        or_(Assignment.valid_from.is_(None), Assignment.valid_from <= d),
        or_(Assignment.valid_to.is_(None), Assignment.valid_to >= d),
    )


def active_assignments(db: Session, user: User, d: date | None = None) -> list[Assignment]:
    d = d or today()
    stmt = (
        select(Assignment)
        .join(Post)
        .where(Assignment.user_id == user.id, Post.active.is_(True), *_valid_on(d))
        .order_by(Assignment.shift_start.nulls_last(), Assignment.id)
    )
    return list(db.scalars(stmt))


def accessible_post_ids(db: Session, user: User) -> set[int] | None:
    """None = semua pos (super_admin)."""
    if user.role == "super_admin":
        return None
    if user.role == "client_admin":
        stmt = select(Post.id).join(Site).where(Site.client_id == user.client_id)
        return set(db.scalars(stmt))
    ids = {a.post_id for a in active_assignments(db, user)}
    if user.role == "supervisor" and user.site_id:
        ids |= set(db.scalars(select(Post.id).where(Post.site_id == user.site_id)))
    return ids


def can_access_post(db: Session, user: User, post_id: int) -> bool:
    ids = accessible_post_ids(db, user)
    return ids is None or post_id in ids


def can_decide_on_post(db: Session, user: User, post_id: int) -> bool:
    """Hanya supervisor/admin di pos itu yang bisa memutuskan insiden (PRD §7)."""
    if user.role in ("super_admin", "client_admin"):
        return can_access_post(db, user, post_id)
    if user.role != "supervisor":
        return False
    if user.site_id and db.scalar(select(Post.site_id).where(Post.id == post_id)) == user.site_id:
        return True
    return any(a.post_id == post_id and a.role_on_post == "supervisor" for a in active_assignments(db, user))


def resolve_scope(db: Session, user: User, scope: str | None) -> set[int] | None:
    """scope = 'all' | 'client:<id>' | 'site:<id>' | 'post:<id>' → set pos (diiris dengan akses user)."""
    allowed = accessible_post_ids(db, user)
    if not scope or scope == "all":
        return allowed
    kind, _, raw = scope.partition(":")
    try:
        ref = int(raw)
    except ValueError:
        return set()
    if kind == "post":
        ids = {ref}
    elif kind == "site":
        ids = set(db.scalars(select(Post.id).where(Post.site_id == ref)))
    elif kind == "client":
        ids = set(db.scalars(select(Post.id).join(Site).where(Site.client_id == ref)))
    else:
        return set()
    return ids if allowed is None else ids & allowed
