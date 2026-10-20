from sqlalchemy.orm import Session

from app.models import ActivityLog, User


def log(
    db: Session, actor: User | None, action: str, entity: str, entity_id: int | None, *,
    device: str | None = None, site_id: int | None = None, post_id: int | None = None, meta: dict | None = None,
) -> None:
    db.add(ActivityLog(
        actor_id=actor.id if actor else None, action=action, entity=entity, entity_id=entity_id,
        device=(device or "")[:300] or None, site_id=site_id, post_id=post_id, meta=meta,
    ))
