"""Check in / check out / insiden + state machine transaksi (PRD §4, §7)."""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.timeutil import now
from app.models import (
    Incident,
    Photo,
    Post,
    TemplateVersion,
    Transaction,
    TransactionCheck,
    TransactionInsideItem,
    User,
    Vehicle,
)
from app.schemas.transactions import CheckIn, CheckinCreate, Checkout, IncidentCreate, InsideIn, PhotoIn
from app.services import activity, scope
from app.services.plates import display_plate, normalize_phone, normalize_plate
from app.services.summary import build_summary
from app.services.template_config import TemplateConfig
from app.services.tickets import is_valid_ticket, new_ticket_code

# Status transaksi & transisi yang sah
TRANSITIONS: dict[str, set[str]] = {
    "parked": {"released", "incident_pending"},
    "incident_pending": {"released", "incident_confirmed"},
    "incident_confirmed": {"released"},
    "released": set(),
}


class ServiceError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _transition(tx: Transaction, to: str) -> None:
    if to not in TRANSITIONS[tx.status]:
        raise ServiceError(409, f"Status {tx.status} tidak bisa diubah ke {to}")
    tx.status = to


def _clamp_time(t: datetime | None) -> datetime:
    current = now()
    if t is None or t > current + timedelta(minutes=5):
        return current
    return t


def get_transaction(db: Session, ref: str) -> Transaction | None:
    """ref = id angka atau client_id (UUID dari HP) — transaksi offline dirujuk pakai UUID."""
    if ref.isdigit():
        return db.get(Transaction, int(ref))
    try:
        cid = uuid.UUID(ref)
    except ValueError:
        return None
    return db.scalar(select(Transaction).where(Transaction.client_id_uuid == cid))


def get_by_ticket(db: Session, code: str) -> Transaction | None:
    return db.scalar(select(Transaction).where(Transaction.ticket_code == code.strip().upper()))


def _object_key(tx: Transaction, phase: str, photo: PhotoIn) -> str:
    at = tx.checkin_at
    name = photo.item_id or photo.side
    return f"{tx.site_id}/{at:%Y/%m}/{tx.client_id_uuid}/{phase}-{name}-{photo.client_id}.jpg"


def _add_photos(db: Session, tx: Transaction, phase: str, photos: list[PhotoIn],
                incident: Incident | None = None) -> None:
    existing = set(db.scalars(select(Photo.client_id_uuid).where(
        Photo.client_id_uuid.in_([p.client_id for p in photos])))) if photos else set()
    for p in photos:
        if p.client_id in existing:
            continue
        tx.photos.append(Photo(
            client_id_uuid=p.client_id, phase=phase, side=p.side, item_id=p.item_id,
            object_key=_object_key(tx, phase, p), taken_at=_clamp_time(p.taken_at),
            incident_id=incident.id if incident else None,
        ))


def _require_sides(config: TemplateConfig, photos: list[PhotoIn], when: str) -> None:
    have = {p.side for p in photos}
    missing = [s for s in config.sides_required() if s not in have]
    if missing:
        raise ServiceError(422, f"Foto {when} wajib: {', '.join(missing)}")


def _checks_map(config: TemplateConfig, checks: list[CheckIn]) -> dict[str, CheckIn]:
    exterior = {it.id for it in config.exterior_items()}
    unknown = [c.item_id for c in checks if c.item_id not in exterior]
    if unknown:
        raise ServiceError(422, f"Item checklist tidak dikenal: {', '.join(unknown)}")
    by_id = {c.item_id: c for c in checks}
    if config.conditions:
        for c in by_id.values():
            if c.condition is not None:
                opt = config.condition(c.condition)
                if not opt:
                    raise ServiceError(422, f"Kondisi tidak dikenal: {c.condition}")
                c.checked = opt.ok
    return by_id


def _require_conditions(config: TemplateConfig, by_id: dict[str, CheckIn]) -> None:
    if not config.conditions:
        return
    missing = [it.label for it in config.exterior_items() if not (by_id.get(it.id) and by_id[it.id].condition)]
    if missing:
        raise ServiceError(422, f"Pilih kondisi untuk semua bagian: {', '.join(missing)}")


def _inside_map(config: TemplateConfig, items: list[InsideIn]) -> dict[str, InsideIn]:
    inside = {it.id for it in config.inside_items()}
    unknown = [i.item_id for i in items if i.item_id not in inside]
    if unknown:
        raise ServiceError(422, f"Barang tidak dikenal: {', '.join(unknown)}")
    return {i.item_id: i for i in items}


def _store_checks(tx: Transaction, config: TemplateConfig, phase: str, by_id: dict[str, CheckIn]) -> None:
    groups = config.group_of()
    for pos, it in enumerate(config.exterior_items()):
        c = by_id.get(it.id)
        tx.checks.append(TransactionCheck(
            phase=phase, item_id=it.id, label_snapshot=it.label, group_snapshot=groups[it.id],
            checked=bool(c and c.checked), condition=c.condition if c else None,
            note=(c.note or "").strip() or None if c else None, position=pos,
        ))


def _store_inside(tx: Transaction, config: TemplateConfig, phase: str, by_id: dict[str, InsideIn]) -> None:
    for pos, it in enumerate(config.inside_items()):
        i = by_id.get(it.id)
        tx.inside_items.append(TransactionInsideItem(
            phase=phase, item_id=it.id, label=it.label, present=bool(i and i.present),
            extra_text=(i.extra_text or "").strip() or None if i and it.free_text else None, position=pos,
        ))


def create_checkin(db: Session, user: User, data: CheckinCreate, device: str) -> tuple[Transaction, bool]:
    existing = get_transaction(db, str(data.client_id))
    if existing:
        return existing, False

    post = db.get(Post, data.post_id)
    if not post or not post.active or not scope.can_access_post(db, user, post.id):
        raise ServiceError(403, "Kamu tidak ditugaskan di pos ini")
    version = db.get(TemplateVersion, data.template_version_id)
    if not version:
        raise ServiceError(422, "Versi template tidak ditemukan")
    config = TemplateConfig.model_validate(version.config)

    plate_norm = normalize_plate(data.plate)
    if len(plate_norm) < 2:
        raise ServiceError(422, "Nomor polisi tidak valid")
    checks = _checks_map(config, data.checks)
    inside = _inside_map(config, data.inside_items)

    _require_sides(config, data.photos, "check in")
    _require_conditions(config, checks)
    photo_items = {p.item_id for p in data.photos if p.item_id}
    problems = []
    for it in config.exterior_items():
        c = checks.get(it.id)
        if (c and c.checked) or not config.item_photo_required(it):
            continue
        # Mode kondisi (Mulus/Penyok/Lecet): kondisinya sudah jadi keterangan, catatan tidak wajib
        has_note = bool(config.conditions) or bool(c and (c.note or "").strip())
        if it.id not in photo_items or not has_note:
            problems.append(it.label)
    if problems:
        raise ServiceError(422, f"Item tidak diceklis wajib foto close-up + catatan: {', '.join(problems)}")
    no_photo = [it.label for it in config.inside_items()
                if it.requires_photo_if_present and inside.get(it.id) and inside[it.id].present
                and it.id not in photo_items]
    if no_photo:
        raise ServiceError(422, f"Barang di dalam wajib difoto: {', '.join(no_photo)}")

    plate = display_plate(data.plate)
    checkin_at = _clamp_time(data.checkin_at)
    ticket = data.ticket_code.strip().upper() if data.ticket_code else ""
    if not is_valid_ticket(ticket) or get_by_ticket(db, ticket):
        ticket = new_ticket_code(checkin_at)

    tx = Transaction(
        client_id_uuid=data.client_id, post_id=post.id, site_id=post.site_id,
        template_version_id=version.id, template_snapshot=config.model_dump(mode="json"),
        plate=plate, plate_normalized=plate_norm, vehicle_type=data.vehicle_type, color=data.color,
        make_model=(data.make_model or "").strip() or None, slot=(data.slot or "").strip().upper() or None,
        key_tag=(data.key_tag or "").strip().upper() or None,
        owner_phone=normalize_phone(data.owner_phone) if data.owner_phone else None, vip=data.vip,
        ticket_code=ticket, status="parked", checkin_at=checkin_at, checkin_by=user.id,
        notes=(data.notes or "").strip() or None,
        summary_text=build_summary(
            config, plate, {k: v.checked for k, v in checks.items()},
            {k: (v.present, v.extra_text) for k, v in inside.items()}, data.notes,
            {k: v.condition for k, v in checks.items() if v.condition},
        ),
    )
    _store_checks(tx, config, "in", checks)
    _store_inside(tx, config, "in", inside)
    db.add(tx)
    _add_photos(db, tx, "in", data.photos)
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        again = get_transaction(db, str(data.client_id))
        if again:
            return again, False
        msg = str(e.orig)
        if "uq_transactions_parked_plate_site" in msg:
            parked = db.scalar(select(Transaction).where(
                Transaction.site_id == post.site_id, Transaction.plate_normalized == plate_norm,
                Transaction.status == "parked"))
            ref = f" (tiket {parked.ticket_code})" if parked else ""
            raise ServiceError(409, f"Plat {plate} masih tercatat parkir di lokasi ini{ref}") from e
        raise

    _upsert_vehicle(db, tx)
    activity.log(db, user, "checkin", "transaction", tx.id, device=device, site_id=tx.site_id, post_id=tx.post_id,
                 meta={"plate": tx.plate, "ticket": tx.ticket_code})
    db.commit()
    return tx, True


def _upsert_vehicle(db: Session, tx: Transaction) -> None:
    v = db.scalar(select(Vehicle).where(Vehicle.plate_normalized == tx.plate_normalized))
    if not v:
        v = Vehicle(plate_normalized=tx.plate_normalized, plate_display=tx.plate)
        db.add(v)
    v.make_model = tx.make_model or v.make_model
    v.color = tx.color or v.color
    v.type = tx.vehicle_type or v.type


def _new_incident(db: Session, user: User, tx: Transaction, data: IncidentCreate) -> Incident:
    if not data.parts and not (data.note or "").strip():
        raise ServiceError(422, "Pilih bagian yang berbeda atau isi catatan")
    next_id = db.scalar(text("SELECT nextval('incidents_id_seq')"))
    inc = Incident(
        id=next_id, code=f"INS-{next_id:04d}", client_id_uuid=data.client_id, transaction_id=tx.id,
        parts=data.parts, note=(data.note or "").strip() or None, status="pending", reported_by=user.id,
    )
    db.add(inc)
    db.flush()
    _add_photos(db, tx, "out", [p.model_copy(update={"side": "detail"}) for p in data.photos], incident=inc)
    return inc


def _assert_post_access(db: Session, user: User, tx: Transaction) -> None:
    if not scope.can_access_post(db, user, tx.post_id):
        raise ServiceError(403, "Transaksi ini bukan dari pos kamu")


def checkout(db: Session, user: User, tx: Transaction, data: Checkout, device: str) -> Transaction:
    if tx.checkout_client_id == data.client_id:
        return tx
    _assert_post_access(db, user, tx)
    if tx.status != "parked":
        raise ServiceError(409, "Kendaraan ini sudah diproses check out")
    config = TemplateConfig.model_validate(tx.template_snapshot)
    _require_sides(config, data.photos, "check out")
    if data.has_new_damage and not data.incident:
        raise ServiceError(422, "Isi detail kerusakan baru sebelum dikirim ke supervisor")

    checks = _checks_map(config, data.checks)
    if checks:
        _store_checks(tx, config, "out", checks)
    _store_inside(tx, config, "out", _inside_map(config, data.inside_items))
    _add_photos(db, tx, "out", data.photos)
    tx.checkout_client_id = data.client_id
    tx.checkout_at = _clamp_time(data.checkout_at)
    tx.checkout_by = user.id
    tx.checkout_notes = (data.notes or "").strip() or None

    if data.has_new_damage:
        _transition(tx, "incident_pending")
        inc = _new_incident(db, user, tx, data.incident)
        activity.log(db, user, "incident_reported", "incident", inc.id, device=device, site_id=tx.site_id,
                     post_id=tx.post_id, meta={"plate": tx.plate, "code": inc.code})
    else:
        _transition(tx, "released")
        tx.released_at = tx.checkout_at
    activity.log(db, user, "checkout", "transaction", tx.id, device=device, site_id=tx.site_id, post_id=tx.post_id,
                 meta={"plate": tx.plate, "has_new_damage": data.has_new_damage})
    db.commit()
    return tx


def report_incident(db: Session, user: User, tx: Transaction, data: IncidentCreate, device: str) -> Incident:
    found = db.scalar(select(Incident).where(Incident.client_id_uuid == data.client_id))
    if found:
        return found
    _assert_post_access(db, user, tx)
    if tx.status not in ("parked", "incident_pending"):
        raise ServiceError(409, "Insiden hanya bisa dibuat untuk kendaraan yang belum diserahkan")
    if tx.status == "parked":
        _transition(tx, "incident_pending")
    inc = _new_incident(db, user, tx, data)
    activity.log(db, user, "incident_reported", "incident", inc.id, device=device, site_id=tx.site_id,
                 post_id=tx.post_id, meta={"plate": tx.plate, "code": inc.code})
    db.commit()
    return inc


def decide(db: Session, user: User, inc: Incident, decision: str, note: str | None, device: str) -> Incident:
    tx = inc.transaction
    if not scope.can_decide_on_post(db, user, tx.post_id):
        raise ServiceError(403, "Hanya supervisor/admin pos ini yang bisa memutuskan insiden")
    if inc.status != "pending":
        if inc.decision == decision:
            return inc
        raise ServiceError(409, "Insiden ini sudah diputuskan")
    t = now()
    inc.decision = decision
    inc.decision_note = (note or "").strip() or None
    inc.decided_by = user.id
    inc.decided_at = t
    if decision == "no_damage":
        inc.status = "dismissed"
        others_pending = any(o.status == "pending" for o in tx.incidents if o.id != inc.id)
        if tx.status == "incident_pending" and not others_pending:
            _transition(tx, "released")
            tx.released_at = t
    else:
        inc.status = "confirmed"
        if tx.status == "incident_pending":
            _transition(tx, "incident_confirmed")
    activity.log(db, user, f"incident_{decision}", "incident", inc.id, device=device, site_id=tx.site_id,
                 post_id=tx.post_id, meta={"plate": tx.plate, "code": inc.code})
    db.commit()
    return inc


def release(db: Session, user: User, tx: Transaction, device: str) -> Transaction:
    _assert_post_access(db, user, tx)
    if tx.status == "released":
        return tx
    if tx.status != "incident_confirmed":
        raise ServiceError(409, "Kendaraan baru bisa diserahkan setelah supervisor memutuskan")
    _transition(tx, "released")
    tx.released_at = now()
    activity.log(db, user, "released", "transaction", tx.id, device=device, site_id=tx.site_id, post_id=tx.post_id,
                 meta={"plate": tx.plate})
    db.commit()
    return tx
