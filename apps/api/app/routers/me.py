from datetime import time, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.core.timeutil import day_bounds, now, today
from app.models import Assignment, ChecklistTemplate, Incident, Transaction, User
from app.services import scope

router = APIRouter(tags=["me"])


def user_out(u: User) -> dict:
    return {
        "id": u.id, "name": u.name, "role": u.role, "staff_code": u.staff_code, "phone": u.phone,
        "email": u.email, "client_id": u.client_id, "has_pin": bool(u.pin_hash),
    }


def shift_label(a: Assignment) -> str | None:
    if a.shift_name:
        name = a.shift_name
    elif a.shift_start:
        h = a.shift_start.hour
        name = "Shift pagi" if 5 <= h < 11 else "Shift siang" if 11 <= h < 17 else "Shift malam"
    else:
        return None
    if a.shift_start and a.shift_end:
        return f"{name} · {a.shift_start:%H.%M}–{a.shift_end:%H.%M}"
    return name


def _in_shift(a: Assignment, t: time) -> bool:
    if not a.shift_start or not a.shift_end:
        return False
    if a.shift_start <= a.shift_end:
        return a.shift_start <= t < a.shift_end
    return t >= a.shift_start or t < a.shift_end


def assignment_out(a: Assignment) -> dict:
    site = a.post.site
    return {
        "id": a.id, "role_on_post": a.role_on_post, "shift": shift_label(a),
        "shift_start": a.shift_start, "shift_end": a.shift_end,
        "post": {"id": a.post.id, "name": a.post.name},
        "site": {"id": site.id, "name": site.name, "address": site.address},
        "client": {"id": site.client.id, "name": site.client.name},
    }


@router.get("/me")
def me(user: CurrentUser):
    return user_out(user)


@router.get("/me/assignment")
def my_assignment(user: CurrentUser, db: DB, post_id: int | None = None):
    items = scope.active_assignments(db, user)
    active = None
    if post_id is not None:
        active = next((a for a in items if a.post_id == post_id), None)
    if active is None:
        t = now().time()
        active = next((a for a in items if _in_shift(a, t)), items[0] if items else None)
    if not active:
        return {"assignments": [], "active": None, "template": None, "supervisors": []}

    site = active.post.site
    template = None
    if site.template_id:
        tpl = db.get(ChecklistTemplate, site.template_id)
        if tpl and tpl.latest:
            template = {"template_id": tpl.id, "name": tpl.name, "version_id": tpl.latest.id,
                        "version": tpl.latest.version, "config": tpl.latest.config}
    supervisors = db.scalars(
        select(User).join(Assignment).where(
            Assignment.post_id == active.post_id, Assignment.role_on_post == "supervisor", User.active.is_(True)
        ).distinct()
    ).all()
    return {
        "assignments": [assignment_out(a) for a in items],
        "active": assignment_out(active),
        "template": template,
        "supervisors": [{"id": s.id, "name": s.name, "phone": s.phone} for s in supervisors],
    }


@router.get("/posts/{post_id}/stats")
def post_stats(post_id: int, user: CurrentUser, db: DB):
    if not scope.can_access_post(db, user, post_id):
        raise HTTPException(403, "Bukan pos kamu")
    start, end = day_bounds(today())
    base = select(func.count(Transaction.id)).where(Transaction.post_id == post_id)
    return {
        "parked": db.scalar(base.where(Transaction.status != "released")),
        "in_today": db.scalar(base.where(Transaction.checkin_at >= start, Transaction.checkin_at < end)),
        "out_today": db.scalar(base.where(Transaction.checkout_at >= start, Transaction.checkout_at < end)),
    }


@router.get("/me/history")
def my_history(user: CurrentUser, db: DB, period: Literal["today", "yesterday", "7d"] = "today"):
    d = today()
    if period == "today":
        start, end = day_bounds(d)
    elif period == "yesterday":
        start, end = day_bounds(d - timedelta(days=1))
    else:
        start, end = day_bounds(d - timedelta(days=6))[0], day_bounds(d)[1]

    txs = db.scalars(
        select(Transaction).options(selectinload(Transaction.post), selectinload(Transaction.incidents))
        .where(or_(
            (Transaction.checkin_by == user.id) & (Transaction.checkin_at >= start) & (Transaction.checkin_at < end),
            (Transaction.checkout_by == user.id) & (Transaction.checkout_at >= start)
            & (Transaction.checkout_at < end),
        ))
    ).all()
    events: list[dict] = []
    for tx in txs:
        base = {"transaction_id": tx.id, "plate": tx.plate, "post": tx.post.name, "status": tx.status,
                "slot": tx.slot, "make_model": tx.make_model}
        if tx.checkin_by == user.id and start <= tx.checkin_at < end:
            events.append({**base, "kind": "in", "at": tx.checkin_at})
        if tx.checkout_by == user.id and tx.checkout_at and start <= tx.checkout_at < end:
            inc = next((i for i in tx.incidents if i.reported_by == user.id), None)
            events.append({**base, "kind": "incident" if inc else "out", "at": tx.checkout_at,
                           "incident_code": inc.code if inc else None,
                           "duration_minutes": int((tx.checkout_at - tx.checkin_at).total_seconds() // 60)})
    events.sort(key=lambda e: e["at"], reverse=True)
    incidents = db.scalar(select(func.count(Incident.id)).where(
        Incident.reported_by == user.id, Incident.created_at >= start, Incident.created_at < end))
    return {
        "period": period,
        "summary": {
            "checkin": sum(1 for e in events if e["kind"] == "in"),
            "checkout": sum(1 for e in events if e["kind"] in ("out", "incident")),
            "incident": incidents,
        },
        "events": events,
    }


