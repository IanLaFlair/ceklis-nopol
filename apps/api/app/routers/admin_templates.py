"""Template checklist: setiap simpan = versi baru (PRD §6)."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, AdminUser, ManagerUser, device_of
from app.core.timeutil import now
from app.models import ChecklistTemplate, Site, TemplateVersion
from app.services import activity
from app.services.template_config import STANDAR_MOBIL, TemplateConfig

router = APIRouter(prefix="/admin/templates", tags=["admin-templates"])


def _visible(user):
    if user.role == "super_admin":
        return ChecklistTemplate.archived_at.is_(None)
    return ChecklistTemplate.archived_at.is_(None) & or_(ChecklistTemplate.client_id.is_(None), ChecklistTemplate.client_id == user.client_id)


def _get(db, user, template_id: int, write: bool = False) -> ChecklistTemplate:
    tpl = db.scalar(select(ChecklistTemplate).options(selectinload(ChecklistTemplate.versions))
                    .where(ChecklistTemplate.id == template_id, _visible(user)))
    if not tpl:
        raise HTTPException(404, "Template tidak ditemukan")
    if write and user.role != "super_admin" and tpl.client_id != user.client_id:
        raise HTTPException(403, "Template global hanya bisa diubah super admin. Duplikat dulu.")
    return tpl


def _out(db, user, tpl: ChecklistTemplate, full: bool = False) -> dict:
    latest = tpl.latest
    stmt = select(Site).where(Site.template_id == tpl.id).order_by(Site.name)
    if user.role != "super_admin":
        # Template global dipakai banyak klien; admin klien hanya melihat lokasinya sendiri
        stmt = stmt.where(Site.client_id == user.client_id)
    used = db.scalars(stmt).all()
    data = {
        "id": tpl.id, "name": tpl.name, "client_id": tpl.client_id,
        "version": latest.version if latest else None, "version_id": latest.id if latest else None,
        "updated_at": latest.created_at if latest else None,
        "used_by": [{"id": s.id, "name": s.name} for s in used],
    }
    if full:
        data["config"] = latest.config if latest else None
        data["versions"] = [{"id": v.id, "version": v.version, "created_at": v.created_at, "created_by": v.created_by}
                            for v in reversed(tpl.versions)]
    return data


def _validate(raw: dict) -> dict:
    try:
        return TemplateConfig.model_validate(raw).model_dump(mode="json")
    except ValidationError as e:
        raise HTTPException(422, "; ".join(err["msg"].removeprefix("Value error, ") for err in e.errors())) from e


class TemplateCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    client_id: int | None = None
    config: dict | None = None


class TemplateSave(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    config: dict


@router.get("")
def list_templates(user: AdminUser, db: DB):
    tpls = db.scalars(select(ChecklistTemplate).options(selectinload(ChecklistTemplate.versions))
                      .where(_visible(user)).order_by(ChecklistTemplate.name)).all()
    return [_out(db, user, t) for t in tpls]


@router.get("/{template_id}")
def get_template(template_id: int, user: AdminUser, db: DB):
    return _out(db, user, _get(db, user, template_id), full=True)


@router.get("/{template_id}/versions/{version}")
def get_version(template_id: int, version: int, user: AdminUser, db: DB):
    tpl = _get(db, user, template_id)
    v = next((v for v in tpl.versions if v.version == version), None)
    if not v:
        raise HTTPException(404, "Versi tidak ditemukan")
    return {"id": v.id, "version": v.version, "created_at": v.created_at, "config": v.config}


@router.post("", status_code=201)
def create_template(body: TemplateCreate, user: ManagerUser, request: Request, db: DB):
    client_id = body.client_id if user.role == "super_admin" else user.client_id
    config = _validate(body.config) if body.config else STANDAR_MOBIL.model_dump(mode="json")
    tpl = ChecklistTemplate(name=body.name.strip(), client_id=client_id)
    tpl.versions.append(TemplateVersion(version=1, config=config, created_by=user.id))
    db.add(tpl)
    db.flush()
    activity.log(db, user, "template_created", "template", tpl.id, device=device_of(request))
    db.commit()
    return _out(db, user, tpl, full=True)


@router.put("/{template_id}")
def save_template(template_id: int, body: TemplateSave, user: ManagerUser, request: Request, db: DB):
    tpl = _get(db, user, template_id, write=True)
    config = _validate(body.config)
    if body.name:
        tpl.name = body.name.strip()
    latest = tpl.latest
    if not latest or latest.config != config:
        tpl.versions.append(TemplateVersion(version=(latest.version if latest else 0) + 1, config=config,
                                            created_by=user.id))
    db.flush()
    activity.log(db, user, "template_saved", "template", tpl.id, device=device_of(request),
                 meta={"version": tpl.latest.version})
    db.commit()
    return _out(db, user, tpl, full=True)


@router.post("/{template_id}/duplicate", status_code=201)
def duplicate_template(template_id: int, user: ManagerUser, request: Request, db: DB):
    src = _get(db, user, template_id)
    tpl = ChecklistTemplate(name=f"{src.name} (salinan)",
                            client_id=src.client_id if user.role == "super_admin" else user.client_id)
    tpl.versions.append(TemplateVersion(version=1, config=src.latest.config, created_by=user.id))
    db.add(tpl)
    db.flush()
    activity.log(db, user, "template_created", "template", tpl.id, device=device_of(request),
                 meta={"from": src.id})
    db.commit()
    return _out(db, user, tpl, full=True)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, user: ManagerUser, request: Request, db: DB):
    tpl = _get(db, user, template_id, write=True)
    used = db.scalars(select(Site.name).where(Site.template_id == tpl.id).order_by(Site.name)).all()
    if used:
        raise HTTPException(409, f"Template masih dipakai {len(used)} lokasi. Ganti template lokasi itu dulu "
                                 f"di Lokasi & Petugas.")
    tpl.archived_at = now()
    activity.log(db, user, "template_deleted", "template", tpl.id, device=device_of(request), meta={"name": tpl.name})
    db.commit()
