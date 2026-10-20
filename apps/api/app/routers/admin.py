from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import extract, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.deps import DB, AdminUser
from app.core.timeutil import day_bounds, today
from app.models import ActivityLog, Assignment, Client, Incident, Post, Site, Transaction, User
from app.routers.transactions import LIST_OPTIONS
from app.services import scope, serialize
from app.services.plates import normalize_plate

router = APIRouter(prefix="/admin", tags=["admin"])

TABS = {
    "all": None,
    "parked": ("parked",),
    "done": ("released",),
    "incident": ("incident_pending", "incident_confirmed"),
}


def _in_scope(col, ids: set[int] | None):
    return True if ids is None else col.in_(ids or {-1})


@router.get("/scope-tree")
def scope_tree(user: AdminUser, db: DB):
    """Klien → lokasi → pos yang boleh dilihat user, untuk filter bertingkat."""
    allowed = scope.accessible_post_ids(db, user)
    posts = db.scalars(select(Post).where(_in_scope(Post.id, allowed)).order_by(Post.name)).all()
    site_ids = {p.site_id for p in posts}
    sites = db.scalars(select(Site).where(Site.id.in_(site_ids or {-1})).order_by(Site.name)).all()
    clients = db.scalars(select(Client).where(Client.id.in_({s.client_id for s in sites} or {-1}))
                         .order_by(Client.name)).all()
    return [{
        "id": c.id, "name": c.name,
        "sites": [{
            "id": s.id, "name": s.name,
            "posts": [{"id": p.id, "name": p.name, "active": p.active} for p in posts if p.site_id == s.id],
        } for s in sites if s.client_id == c.id],
    } for c in clients]


@router.get("/stats")
def stats(user: AdminUser, db: DB, scope_: str = Query("all", alias="scope")):
    ids = scope.resolve_scope(db, user, scope_)
    start, end = day_bounds(today())
    tx_in = _in_scope(Transaction.post_id, ids)
    count = select(func.count(Transaction.id)).where(tx_in)
    tz = get_settings().app_tz

    released_today = select(
        func.avg(func.extract("epoch", Transaction.released_at - Transaction.checkin_at))
    ).where(tx_in, Transaction.released_at >= start, Transaction.released_at < end)
    avg_seconds = db.scalar(released_today)

    def hourly(col):
        hour = extract("hour", func.timezone(tz, col))
        rows = db.execute(select(hour, func.count()).where(tx_in, col >= start, col < end).group_by(hour)).all()
        return {int(h): n for h, n in rows}

    ins, outs = hourly(Transaction.checkin_at), hourly(Transaction.checkout_at)

    feed = db.scalars(
        select(ActivityLog).options(selectinload(ActivityLog.actor))
        .where(_in_scope(ActivityLog.post_id, ids),
               ActivityLog.action.in_(("checkin", "checkout", "incident_reported", "incident_no_damage",
                                       "incident_damage_confirmed", "released")))
        .order_by(ActivityLog.created_at.desc()).limit(8)
    ).all()
    post_names = {p.id: (p.name, p.site.name) for p in db.scalars(
        select(Post).options(selectinload(Post.site)).where(Post.id.in_({a.post_id for a in feed} or {-1})))}

    return {
        "kpi": {
            "parked": db.scalar(count.where(Transaction.status != "released")),
            "in_today": db.scalar(count.where(Transaction.checkin_at >= start, Transaction.checkin_at < end)),
            "out_today": db.scalar(count.where(Transaction.checkout_at >= start, Transaction.checkout_at < end)),
            "open_incidents": db.scalar(select(func.count(Incident.id)).join(Transaction)
                                        .where(tx_in, Incident.status == "pending")),
            "avg_duration_minutes": int(avg_seconds // 60) if avg_seconds else None,
        },
        "hourly": [{"hour": h, "in": ins.get(h, 0), "out": outs.get(h, 0)} for h in range(24)],
        "activity": [{
            "action": a.action, "at": a.created_at, "plate": (a.meta or {}).get("plate"),
            "code": (a.meta or {}).get("code"), "actor": a.actor.name if a.actor else None,
            "post": post_names.get(a.post_id, ("", ""))[0], "site": post_names.get(a.post_id, ("", ""))[1],
        } for a in feed],
        "rows": _location_rows(db, ids, start, end),
    }


def _location_rows(db, ids, start, end) -> list[dict]:
    posts = db.scalars(select(Post).options(selectinload(Post.site)).where(_in_scope(Post.id, ids))
                       .order_by(Post.name)).all()
    if not posts:
        return []
    pids = [p.id for p in posts]

    def per_post(stmt):
        return dict(db.execute(stmt.group_by(Transaction.post_id)).all())

    base = select(Transaction.post_id, func.count(Transaction.id)).where(Transaction.post_id.in_(pids))
    parked = per_post(base.where(Transaction.status != "released"))
    ins = per_post(base.where(Transaction.checkin_at >= start, Transaction.checkin_at < end))
    outs = per_post(base.where(Transaction.checkout_at >= start, Transaction.checkout_at < end))
    incs = dict(db.execute(
        select(Transaction.post_id, func.count(Incident.id)).join(Transaction)
        .where(Transaction.post_id.in_(pids), Incident.status == "pending").group_by(Transaction.post_id)
    ).all())
    staff: dict[int, list[str]] = {}
    for post_id, name in db.execute(
        select(Assignment.post_id, User.name).join(User)
        .where(Assignment.post_id.in_(pids), Assignment.role_on_post == "petugas", User.active.is_(True),
               or_(Assignment.valid_to.is_(None), Assignment.valid_to >= today()))
        .order_by(User.name)
    ):
        staff.setdefault(post_id, []).append(name)

    rows: list[dict] = []
    by_site: dict[int, list[Post]] = {}
    for p in posts:
        by_site.setdefault(p.site_id, []).append(p)
    for site_posts in sorted(by_site.values(), key=lambda ps: ps[0].site.name):
        site = site_posts[0].site
        sums = {k: sum(d.get(p.id, 0) for p in site_posts) for k, d in
                (("parked", parked), ("in", ins), ("out", outs), ("incidents", incs))}
        rows.append({"kind": "site", "id": site.id, "name": site.name, **sums,
                     "staff": sorted({n for p in site_posts for n in staff.get(p.id, [])})})
        if len(site_posts) > 1:
            rows += [{"kind": "post", "id": p.id, "name": p.name, "parked": parked.get(p.id, 0),
                      "in": ins.get(p.id, 0), "out": outs.get(p.id, 0), "incidents": incs.get(p.id, 0),
                      "staff": staff.get(p.id, [])} for p in site_posts]
    return rows


@router.get("/transactions")
def admin_transactions(
    user: AdminUser, db: DB,
    scope_: str = Query("all", alias="scope"),
    tab: Literal["all", "parked", "done", "incident"] = "all",
    q: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    ids = scope.resolve_scope(db, user, scope_)
    where = [_in_scope(Transaction.post_id, ids)]
    if q:
        like = f"%{q.strip()}%"
        norm = normalize_plate(q)
        where.append(or_(
            Transaction.plate_normalized.contains(norm) if norm else False,
            Transaction.vehicle_type.ilike(like), Transaction.color.ilike(like),
            Transaction.make_model.ilike(like), Transaction.ticket_code.ilike(like),
        ))
    counts = {}
    for key, statuses in TABS.items():
        stmt = select(func.count(Transaction.id)).where(*where)
        if statuses:
            stmt = stmt.where(Transaction.status.in_(statuses))
        counts[key] = db.scalar(stmt)
    stmt = select(Transaction).options(*LIST_OPTIONS).where(*where)
    if TABS[tab]:
        stmt = stmt.where(Transaction.status.in_(TABS[tab]))
    items = db.scalars(stmt.order_by(Transaction.checkin_at.desc()).limit(limit).offset(offset)).all()
    return {"counts": counts, "items": [serialize.tx_list_item(t) for t in items]}


@router.get("/incidents")
def admin_incidents(
    user: AdminUser, db: DB,
    scope_: str = Query("all", alias="scope"),
    status: Literal["all", "pending", "confirmed", "dismissed"] = "all",
    limit: int = Query(100, le=300),
):
    ids = scope.resolve_scope(db, user, scope_)
    stmt = (
        select(Incident).join(Transaction)
        .options(selectinload(Incident.transaction).selectinload(Transaction.post),
                 selectinload(Incident.transaction).selectinload(Transaction.site),
                 selectinload(Incident.reporter), selectinload(Incident.decider))
        .where(_in_scope(Transaction.post_id, ids))
    )
    if status != "all":
        stmt = stmt.where(Incident.status == status)
    # Pending selalu di atas
    stmt = stmt.order_by((Incident.status != "pending"), Incident.created_at.desc()).limit(limit)
    out = []
    for i in db.scalars(stmt):
        tx = i.transaction
        out.append({**serialize.incident_brief(i), "plate": tx.plate, "transaction_id": tx.id,
                    "post": tx.post.name, "site": tx.site.name})
    pending = db.scalar(select(func.count(Incident.id)).join(Transaction)
                        .where(_in_scope(Transaction.post_id, ids), Incident.status == "pending"))
    return {"pending": pending, "items": out}


@router.get("/transactions/{tx_id}/activity")
def transaction_activity(tx_id: int, user: AdminUser, db: DB):
    tx = db.get(Transaction, tx_id)
    if not tx or not scope.can_access_post(db, user, tx.post_id):
        return []
    inc_ids = [i.id for i in tx.incidents]
    logs = db.scalars(
        select(ActivityLog).options(selectinload(ActivityLog.actor)).where(or_(
            (ActivityLog.entity == "transaction") & (ActivityLog.entity_id == tx_id),
            (ActivityLog.entity == "incident") & ActivityLog.entity_id.in_(inc_ids or [-1]),
        )).order_by(ActivityLog.created_at)
    ).all()
    return [{"action": a.action, "at": a.created_at, "actor": a.actor.name if a.actor else None,
             "device": a.device, "meta": a.meta} for a in logs]
