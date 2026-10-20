"""Bentuk respons JSON untuk transaksi & insiden."""
from app.core.timeutil import now
from app.models import Incident, Photo, Transaction
from app.services import storage


def minutes_between(start, end) -> int:
    return max(0, int(((end or now()) - start).total_seconds() // 60))


def user_brief(u) -> dict | None:
    return {"id": u.id, "name": u.name} if u else None


def photo_out(p: Photo) -> dict:
    uploaded = p.uploaded_at is not None
    available = uploaded and p.deleted_at is None
    return {
        "id": p.id, "client_id": str(p.client_id_uuid), "phase": p.phase, "side": p.side, "item_id": p.item_id,
        "incident_id": p.incident_id, "taken_at": p.taken_at, "uploaded": uploaded,
        "deleted": p.deleted_at is not None,
        "url": storage.presign_get(p.object_key) if available else None,
        "thumb_url": storage.presign_get(p.thumb_key) if available and p.thumb_key else None,
    }


def incident_brief(i: Incident) -> dict:
    return {
        "id": i.id, "code": i.code, "status": i.status, "parts": i.parts, "note": i.note,
        "created_at": i.created_at, "reported_by": user_brief(i.reporter), "decision": i.decision,
        "decision_note": i.decision_note, "decided_at": i.decided_at, "decided_by": user_brief(i.decider),
    }


def tx_list_item(tx: Transaction) -> dict:
    return {
        "id": tx.id, "client_id": str(tx.client_id_uuid), "ticket_code": tx.ticket_code, "status": tx.status,
        "plate": tx.plate, "vehicle_type": tx.vehicle_type, "color": tx.color, "make_model": tx.make_model,
        "slot": tx.slot, "key_tag": tx.key_tag, "vip": tx.vip, "notes": tx.notes,
        "has_issue": any(not c.checked for c in tx.checks if c.phase == "in"),
        "post": {"id": tx.post_id, "name": tx.post.name},
        "site": {"id": tx.site_id, "name": tx.site.name},
        "checkin_at": tx.checkin_at, "checkin_by": user_brief(tx.checkin_user),
        "checkout_at": tx.checkout_at, "checkout_by": user_brief(tx.checkout_user), "released_at": tx.released_at,
        "duration_minutes": minutes_between(tx.checkin_at, tx.released_at or tx.checkout_at),
    }


def tx_detail(tx: Transaction) -> dict:
    data = tx_list_item(tx)
    data.update({
        "owner_phone": tx.owner_phone, "checkout_notes": tx.checkout_notes, "summary_text": tx.summary_text,
        "template_version_id": tx.template_version_id, "template": tx.template_snapshot,
        "checks": [{
            "phase": c.phase, "item_id": c.item_id, "label": c.label_snapshot, "group": c.group_snapshot,
            "checked": c.checked, "condition": c.condition, "note": c.note,
        } for c in tx.checks],
        "inside_items": [{
            "phase": i.phase, "item_id": i.item_id, "label": i.label, "present": i.present,
            "extra_text": i.extra_text,
        } for i in tx.inside_items],
        "photos": [photo_out(p) for p in tx.photos],
        "photos_complete": all(p.uploaded_at for p in tx.photos),
        "incidents": [incident_brief(i) for i in tx.incidents],
    })
    return data


def incident_detail(i: Incident) -> dict:
    tx = i.transaction
    data = incident_brief(i)
    data["transaction"] = tx_detail(tx)
    return data
