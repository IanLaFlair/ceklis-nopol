from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser, device_of
from app.models import Incident, Transaction
from app.schemas.transactions import CheckinCreate, Checkout, Decision, IncidentCreate
from app.services import scope, serialize
from app.services import transactions as svc
from app.services.plates import normalize_plate

router = APIRouter(tags=["transactions"])

LIST_OPTIONS = (
    selectinload(Transaction.post), selectinload(Transaction.site), selectinload(Transaction.checks),
    selectinload(Transaction.checkin_user), selectinload(Transaction.checkout_user),
)


def _load(db, ref: str, user) -> Transaction:
    tx = svc.get_transaction(db, ref)
    if not tx or not scope.can_access_post(db, user, tx.post_id):
        raise HTTPException(404, "Transaksi tidak ditemukan")
    return tx


def _run(fn, *args):
    try:
        return fn(*args)
    except svc.ServiceError as e:
        raise HTTPException(e.status, e.detail) from e


@router.post("/transactions", status_code=201)
def create_transaction(body: CheckinCreate, request: Request, response: Response, user: CurrentUser, db: DB):
    tx, created = _run(svc.create_checkin, db, user, body, device_of(request))
    if not created:
        if not scope.can_access_post(db, user, tx.post_id):
            raise HTTPException(409, "client_id sudah dipakai")
        response.status_code = 200
    return serialize.tx_detail(tx)


@router.get("/transactions")
def list_transactions(
    user: CurrentUser, db: DB,
    post_id: int | None = None,
    status: str | None = Query(None, description="koma: parked,incident_pending,..."),
    q: str | None = None,
    limit: int = Query(100, le=500),
):
    allowed = scope.accessible_post_ids(db, user)
    stmt = select(Transaction).options(*LIST_OPTIONS)
    if post_id is not None:
        if allowed is not None and post_id not in allowed:
            raise HTTPException(403, "Bukan pos kamu")
        stmt = stmt.where(Transaction.post_id == post_id)
    elif allowed is not None:
        stmt = stmt.where(Transaction.post_id.in_(allowed))
    if status:
        stmt = stmt.where(Transaction.status.in_(status.split(",")))
    if q:
        norm = normalize_plate(q)
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            Transaction.plate_normalized.contains(norm) if norm else False,
            Transaction.slot.ilike(like), Transaction.ticket_code.ilike(like),
        ))
    stmt = stmt.order_by(Transaction.checkin_at.desc()).limit(limit)
    return [serialize.tx_list_item(tx) for tx in db.scalars(stmt)]


@router.get("/transactions/{ref}")
def get_transaction(ref: str, user: CurrentUser, db: DB):
    return serialize.tx_detail(_load(db, ref, user))


@router.get("/tickets/{code}")
def get_ticket(code: str, user: CurrentUser, db: DB):
    tx = svc.get_by_ticket(db, code)
    if not tx or not scope.can_access_post(db, user, tx.post_id):
        raise HTTPException(404, "Tiket cek list tidak ditemukan")
    return serialize.tx_detail(tx)


@router.post("/transactions/{ref}/checkout")
def checkout(ref: str, body: Checkout, request: Request, user: CurrentUser, db: DB):
    tx = _load(db, ref, user)
    return serialize.tx_detail(_run(svc.checkout, db, user, tx, body, device_of(request)))


@router.post("/transactions/{ref}/incident", status_code=201)
def report_incident(ref: str, body: IncidentCreate, request: Request, user: CurrentUser, db: DB):
    tx = _load(db, ref, user)
    inc = _run(svc.report_incident, db, user, tx, body, device_of(request))
    return serialize.incident_detail(inc)


@router.post("/transactions/{ref}/release")
def release(ref: str, request: Request, user: CurrentUser, db: DB):
    tx = _load(db, ref, user)
    return serialize.tx_detail(_run(svc.release, db, user, tx, device_of(request)))


def _load_incident(db, incident_id: int, user) -> Incident:
    inc = db.get(Incident, incident_id)
    if not inc or not scope.can_access_post(db, user, inc.transaction.post_id):
        raise HTTPException(404, "Insiden tidak ditemukan")
    return inc


@router.get("/incidents/{incident_id}")
def get_incident(incident_id: int, user: CurrentUser, db: DB):
    return serialize.incident_detail(_load_incident(db, incident_id, user))


@router.post("/incidents/{incident_id}/decision")
def decide(incident_id: int, body: Decision, request: Request, user: CurrentUser, db: DB):
    inc = _load_incident(db, incident_id, user)
    inc = _run(svc.decide, db, user, inc, body.decision, body.note, device_of(request))
    return serialize.incident_detail(inc)
