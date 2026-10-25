"""Lokasi & petugas: klien → lokasi → pos, user, penugasan (PRD §5 /admin/lokasi)."""
import secrets
from datetime import date, time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.deps import DB, AdminUser, ManagerUser, StaffManagerUser, device_of
from app.core.security import decrypt_pin, encrypt_pin, hash_secret
from app.core.timeutil import day_bounds, today
from app.models import (
    ActivityLog,
    Assignment,
    ChecklistTemplate,
    Client,
    Post,
    Site,
    Transaction,
    User,
)
from app.routers.me import shift_label, user_out
from app.services import activity, scope
from app.services.plates import normalize_phone

router = APIRouter(prefix="/admin", tags=["admin-org"])


def _site_supervisor_guard(db, user, target: User) -> None:
    """Supervisor lokasi hanya boleh mengelola petugas yang bertugas di lokasinya (atau belum punya tugas)."""
    if user.role != "supervisor":
        return
    if target.role != "petugas" or target.client_id != user.client_id:
        raise HTTPException(403, "Supervisor hanya bisa mengelola petugas")
    sites = set(db.scalars(select(Post.site_id).join(Assignment).where(Assignment.user_id == target.id)))
    if sites - {user.site_id}:
        raise HTTPException(403, "Petugas ini juga bertugas di lokasi lain. Minta admin klien.")


def _own_client(user, client_id: int | None) -> None:
    if user.role == "super_admin":
        return
    if client_id is None or client_id != user.client_id:
        raise HTTPException(403, "Di luar klien kamu")


def _site(db, user, site_id: int) -> Site:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(404, "Lokasi tidak ditemukan")
    allowed = scope.accessible_post_ids(db, user)
    if allowed is not None and user.role != "client_admin" and not {p.id for p in site.posts} & allowed:
        raise HTTPException(404, "Lokasi tidak ditemukan")
    if user.role == "client_admin":
        _own_client(user, site.client_id)
    return site


def _commit(db, msg: str = "Data bentrok dengan data lain") -> None:
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, msg) from e


# ---------- klien ----------

class ClientIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)


@router.get("/clients")
def list_clients(user: AdminUser, db: DB):
    stmt = select(Client).order_by(Client.name)
    if user.role != "super_admin":
        stmt = stmt.where(Client.id == user.client_id) if user.client_id else stmt.where(False)
    return [{"id": c.id, "name": c.name} for c in db.scalars(stmt)]


@router.post("/clients", status_code=201)
def create_client(body: ClientIn, user: ManagerUser, request: Request, db: DB):
    if user.role != "super_admin":
        raise HTTPException(403, "Hanya super admin yang bisa menambah klien")
    c = Client(name=body.name.strip())
    db.add(c)
    db.flush()
    activity.log(db, user, "client_created", "client", c.id, device=device_of(request))
    db.commit()
    return {"id": c.id, "name": c.name}


@router.patch("/clients/{client_id}")
def update_client(client_id: int, body: ClientIn, user: ManagerUser, db: DB):
    _own_client(user, client_id)
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404, "Klien tidak ditemukan")
    c.name = body.name.strip()
    db.commit()
    return {"id": c.id, "name": c.name}


@router.delete("/clients/{client_id}", status_code=204)
def delete_client(client_id: int, user: ManagerUser, request: Request, db: DB):
    """Hanya klien kosong (salah ketik / batal) yang bisa dihapus; data operasional tidak ikut terhapus."""
    if user.role != "super_admin":
        raise HTTPException(403, "Hanya super admin yang bisa menghapus klien")
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404, "Klien tidak ditemukan")
    in_use = (
        db.scalar(select(func.count()).select_from(Site).where(Site.client_id == client_id))
        or db.scalar(select(func.count()).select_from(User).where(User.client_id == client_id))
        or db.scalar(select(func.count()).select_from(ChecklistTemplate).where(ChecklistTemplate.client_id == client_id))
    )
    if in_use:
        raise HTTPException(409, "Klien masih punya lokasi, user, atau template. Hapus atau pindahkan dulu.")
    activity.log(db, user, "client_deleted", "client", c.id, device=device_of(request), meta={"name": c.name})
    db.delete(c)
    db.commit()


# ---------- lokasi & pos ----------

class SiteIn(BaseModel):
    client_id: int
    name: str = Field(min_length=2, max_length=200)
    address: str | None = None
    template_id: int | None = None


class SitePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    address: str | None = None
    template_id: int | None = None


def _site_out(s: Site) -> dict:
    return {"id": s.id, "client_id": s.client_id, "name": s.name, "address": s.address,
            "template_id": s.template_id,
            "posts": [{"id": p.id, "name": p.name, "active": p.active} for p in s.posts]}


def _check_template(db, user, template_id: int | None) -> None:
    if template_id is None:
        return
    tpl = db.get(ChecklistTemplate, template_id)
    if not tpl or tpl.archived_at:
        raise HTTPException(422, "Template tidak ditemukan")
    if tpl.client_id is not None:
        _own_client(user, tpl.client_id)


@router.get("/sites")
def list_sites(user: AdminUser, db: DB, client_id: int | None = None):
    allowed = scope.accessible_post_ids(db, user)
    stmt = select(Site).options(selectinload(Site.posts)).order_by(Site.name)
    if client_id:
        stmt = stmt.where(Site.client_id == client_id)
    if user.role == "client_admin":
        stmt = stmt.where(Site.client_id == user.client_id)
    sites = db.scalars(stmt).all()
    if allowed is not None and user.role != "client_admin":
        sites = [s for s in sites if {p.id for p in s.posts} & allowed]
    return [_site_out(s) for s in sites]


@router.post("/sites", status_code=201)
def create_site(body: SiteIn, user: ManagerUser, request: Request, db: DB):
    _own_client(user, body.client_id)
    _check_template(db, user, body.template_id)
    site = Site(client_id=body.client_id, name=body.name.strip(), address=body.address,
                template_id=body.template_id)
    db.add(site)
    db.flush()
    activity.log(db, user, "site_created", "site", site.id, site_id=site.id, device=device_of(request))
    _commit(db)
    return _site_out(site)


@router.patch("/sites/{site_id}")
def update_site(site_id: int, body: SitePatch, user: ManagerUser, request: Request, db: DB):
    site = _site(db, user, site_id)
    _own_client(user, site.client_id)
    data = body.model_dump(exclude_unset=True)
    if "template_id" in data:
        _check_template(db, user, data["template_id"])
    for k, v in data.items():
        setattr(site, k, v.strip() if isinstance(v, str) else v)
    activity.log(db, user, "site_updated", "site", site.id, site_id=site.id, device=device_of(request), meta=data)
    _commit(db)
    return _site_out(site)


class PostIn(BaseModel):
    site_id: int
    name: str = Field(min_length=1, max_length=120)


class PostPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    active: bool | None = None


@router.post("/posts", status_code=201)
def create_post(body: PostIn, user: ManagerUser, request: Request, db: DB):
    site = _site(db, user, body.site_id)
    _own_client(user, site.client_id)
    post = Post(site_id=site.id, name=body.name.strip(), active=True)
    db.add(post)
    db.flush()
    activity.log(db, user, "post_created", "post", post.id, site_id=site.id, post_id=post.id,
                 device=device_of(request))
    db.commit()
    return {"id": post.id, "name": post.name, "active": post.active, "site_id": site.id}


@router.patch("/posts/{post_id}")
def update_post(post_id: int, body: PostPatch, user: ManagerUser, db: DB):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Pos tidak ditemukan")
    _own_client(user, post.site.client_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(post, k, v)
    db.commit()
    return {"id": post.id, "name": post.name, "active": post.active, "site_id": post.site_id}


@router.get("/sites/{site_id}/overview")
def site_overview(site_id: int, user: AdminUser, db: DB):
    """Isi layar Lokasi & Petugas: tabel pos + petugas di lokasi."""
    site = _site(db, user, site_id)
    pids = [p.id for p in site.posts]
    start, end = day_bounds(today())
    parked = dict(db.execute(
        select(Transaction.post_id, func.count()).where(Transaction.post_id.in_(pids or [-1]),
                                                       Transaction.status != "released")
        .group_by(Transaction.post_id)).all())
    assigns = db.scalars(
        select(Assignment).options(selectinload(Assignment.user), selectinload(Assignment.post))
        .where(Assignment.post_id.in_(pids or [-1])).order_by(Assignment.id)).all()
    t = today()
    current = [a for a in assigns if (not a.valid_from or a.valid_from <= t) and (not a.valid_to or a.valid_to >= t)]
    checks_today = dict(db.execute(
        select(ActivityLog.actor_id, func.count()).where(
            ActivityLog.post_id.in_(pids or [-1]), ActivityLog.action.in_(("checkin", "checkout")),
            ActivityLog.created_at >= start, ActivityLog.created_at < end)
        .group_by(ActivityLog.actor_id)).all())
    tpl = db.get(ChecklistTemplate, site.template_id) if site.template_id else None

    posts = []
    for p in site.posts:
        on_post = [a for a in current if a.post_id == p.id and a.user.active]
        posts.append({
            "id": p.id, "name": p.name, "active": p.active, "parked": parked.get(p.id, 0),
            "staff": [a.user.name for a in on_post if a.role_on_post == "petugas"],
            "supervisors": [a.user.name for a in on_post if a.role_on_post == "supervisor"],
        })
    staff: dict[int, dict] = {}
    for a in current:
        u = a.user
        row = staff.setdefault(u.id, {
            "user": user_out(u), "role": u.role, "active": u.active, "posts": [],
            "checks_today": checks_today.get(u.id, 0), "last_active_at": u.last_active_at, "assignments": [],
        })
        row["posts"].append(a.post.name)
        row["assignments"].append(_assignment_out(a))
    for u in db.scalars(select(User).where(User.site_id == site.id, User.role == "supervisor")):
        staff.setdefault(u.id, {
            "user": user_out(u), "role": u.role, "active": u.active, "posts": ["Semua pos"],
            "checks_today": checks_today.get(u.id, 0), "last_active_at": u.last_active_at, "assignments": [],
        })
    return {
        "site": {**_site_out(site), "client": {"id": site.client.id, "name": site.client.name},
                 "template": {"id": tpl.id, "name": tpl.name} if tpl else None},
        "posts": posts,
        "staff": sorted(staff.values(), key=lambda r: r["user"]["name"]),
    }


# ---------- user ----------

class UserIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: str = Field(pattern=r"^(super_admin|client_admin|supervisor|petugas)$")
    phone: str | None = None
    email: str | None = None
    staff_code: str | None = Field(default=None, max_length=32)
    client_id: int | None = None
    site_id: int | None = None
    password: str | None = Field(default=None, min_length=8)


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = Field(default=None, pattern=r"^(super_admin|client_admin|supervisor|petugas)$")
    phone: str | None = None
    email: str | None = None
    active: bool | None = None
    reset_pin: bool = False
    password: str | None = Field(default=None, min_length=8)


def _new_pin() -> str:
    while True:
        pin = f"{secrets.randbelow(10**6):06d}"
        if len(set(pin)) > 2:
            return pin


def _next_staff_code(db) -> str:
    n = db.scalar(select(func.count(User.id))) + 1
    while True:
        code = f"PTG-{n:04d}"
        if not db.scalar(select(User.id).where(User.staff_code == code)):
            return code
        n += 1


def _guard_role(user, role: str) -> None:
    if role == "super_admin" and user.role != "super_admin":
        raise HTTPException(403, "Hanya super admin yang bisa membuat super admin")


@router.get("/users")
def list_users(user: AdminUser, db: DB, role: str | None = None, q: str | None = None):
    stmt = select(User).order_by(User.name)
    if user.role != "super_admin":
        stmt = stmt.where(User.client_id == user.client_id)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        stmt = stmt.where(User.name.ilike(f"%{q}%") | User.phone.ilike(f"%{q}%") | User.staff_code.ilike(f"%{q}%"))
    return [{**user_out(u), "active": u.active, "last_active_at": u.last_active_at} for u in db.scalars(stmt)]


@router.post("/users", status_code=201)
def create_user(body: UserIn, user: StaffManagerUser, request: Request, db: DB):
    """Tambah user. Petugas mendapat PIN 6 digit dari sistem."""
    if user.role == "supervisor" and body.role != "petugas":
        raise HTTPException(403, "Supervisor hanya bisa menambah petugas")
    _guard_role(user, body.role)
    client_id = body.client_id if user.role == "super_admin" else user.client_id
    if body.role != "super_admin" and client_id is None:
        raise HTTPException(422, "Pilih klien untuk user ini")
    phone = normalize_phone(body.phone) if body.phone else None
    email = body.email.strip().lower() if body.email else None
    site_id = None
    if body.role == "supervisor" and body.site_id:
        # Supervisor per lokasi: masuk dashboard dengan email + password, melihat semua pos di lokasinya
        site = db.get(Site, body.site_id)
        if not site:
            raise HTTPException(422, "Lokasi tidak ditemukan")
        _own_client(user, site.client_id)
        if site.client_id != client_id:
            raise HTTPException(422, "Lokasi bukan milik klien ini")
        if not email or not body.password:
            raise HTTPException(422, "Email dan password wajib untuk supervisor")
        site_id = site.id
    elif body.role in ("petugas", "supervisor") and not phone:
        raise HTTPException(422, "Nomor HP wajib untuk petugas / supervisor")
    if body.role in ("super_admin", "client_admin") and not email:
        raise HTTPException(422, "Email wajib untuk admin")
    # Supervisor per lokasi tidak memakai aplikasi petugas, jadi tidak perlu PIN
    pin = _new_pin() if body.role == "petugas" or (body.role == "supervisor" and not site_id) else None
    u = User(
        name=body.name.strip(), role=body.role, phone=phone, email=email, client_id=client_id, site_id=site_id,
        staff_code=(body.staff_code or "").strip().upper() or _next_staff_code(db),
        pin_hash=hash_secret(pin) if pin else None, pin_encrypted=encrypt_pin(pin) if pin else None,
        password_hash=hash_secret(body.password) if body.password else None, active=True,
    )
    db.add(u)
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, "Nomor HP, email, atau ID petugas sudah dipakai") from e
    activity.log(db, user, "user_created", "user", u.id, device=device_of(request), meta={"role": u.role})
    db.commit()
    return {**user_out(u), "pin": pin}


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, user: StaffManagerUser, request: Request, db: DB):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User tidak ditemukan")
    if user.role != "super_admin":
        _own_client(user, u.client_id)
    _site_supervisor_guard(db, user, u)
    if user.role == "supervisor" and body.model_dump(exclude_unset=True, exclude={"reset_pin", "active"}):
        raise HTTPException(403, "Supervisor hanya bisa reset PIN atau menonaktifkan petugas")
    data = body.model_dump(exclude_unset=True, exclude={"reset_pin", "password"})
    if "role" in data:
        _guard_role(user, data["role"])
    if "phone" in data:
        data["phone"] = normalize_phone(data["phone"]) if data["phone"] else None
    if "email" in data:
        data["email"] = data["email"].strip().lower() if data["email"] else None
    for k, v in data.items():
        setattr(u, k, v)
    pin = None
    if body.reset_pin:
        pin = _new_pin()
        u.pin_hash = hash_secret(pin)
        u.pin_encrypted = encrypt_pin(pin)
    if body.password:
        u.password_hash = hash_secret(body.password)
    activity.log(db, user, "user_updated", "user", u.id, device=device_of(request),
                 meta={**{k: v for k, v in data.items() if k != "email"}, "reset_pin": body.reset_pin})
    _commit(db, "Nomor HP atau email sudah dipakai")
    return {**user_out(u), "active": u.active, "pin": pin}


@router.get("/users/{user_id}/pin")
def view_pin(user_id: int, user: StaffManagerUser, request: Request, db: DB):
    u = db.get(User, user_id)
    if not u or not u.pin_hash:
        raise HTTPException(404, "User ini tidak punya PIN")
    if user.role != "super_admin":
        _own_client(user, u.client_id)
    _site_supervisor_guard(db, user, u)
    pin = decrypt_pin(u.pin_encrypted)
    if pin is None:
        raise HTTPException(409, "PIN lama tidak tersimpan. Klik Reset PIN untuk membuat PIN baru.")
    activity.log(db, user, "pin_viewed", "user", u.id, device=device_of(request))
    db.commit()
    return {"pin": pin}


# ---------- penugasan ----------

class AssignmentIn(BaseModel):
    user_id: int
    post_id: int
    role_on_post: str = Field(default="petugas", pattern=r"^(petugas|supervisor)$")
    shift_name: str | None = None
    shift_start: time | None = None
    shift_end: time | None = None
    valid_from: date | None = None
    valid_to: date | None = None


class AssignmentPatch(BaseModel):
    post_id: int | None = None
    role_on_post: str | None = Field(default=None, pattern=r"^(petugas|supervisor)$")
    shift_name: str | None = None
    shift_start: time | None = None
    shift_end: time | None = None
    valid_from: date | None = None
    valid_to: date | None = None


def _assignment_out(a: Assignment) -> dict:
    return {
        "id": a.id, "user_id": a.user_id, "user_name": a.user.name, "post_id": a.post_id, "post_name": a.post.name,
        "role_on_post": a.role_on_post, "shift_name": a.shift_name, "shift": shift_label(a),
        "shift_start": a.shift_start, "shift_end": a.shift_end, "valid_from": a.valid_from, "valid_to": a.valid_to,
    }


def _check_assignment(db, user, user_id: int, post_id: int, role_on_post: str) -> None:
    target = db.get(User, user_id)
    post = db.get(Post, post_id)
    if not target or not post:
        raise HTTPException(404, "User atau pos tidak ditemukan")
    _own_client(user, post.site.client_id)
    if target.client_id not in (None, post.site.client_id):
        raise HTTPException(422, "User ini milik klien lain")
    if user.role == "supervisor":
        if post.site_id != user.site_id or role_on_post != "petugas":
            raise HTTPException(403, "Supervisor hanya bisa menugaskan petugas di lokasinya")
        _site_supervisor_guard(db, user, target)
    if role_on_post == "supervisor" and target.role not in ("supervisor", "client_admin", "super_admin"):
        raise HTTPException(422, "Hanya user berperan supervisor yang bisa jadi supervisor pos")


@router.get("/assignments")
def list_assignments(user: AdminUser, db: DB, post_id: int | None = None, user_id: int | None = None,
                     site_id: int | None = None):
    allowed = scope.accessible_post_ids(db, user)
    stmt = select(Assignment).options(selectinload(Assignment.user), selectinload(Assignment.post))
    if post_id:
        stmt = stmt.where(Assignment.post_id == post_id)
    if user_id:
        stmt = stmt.where(Assignment.user_id == user_id)
    if site_id:
        stmt = stmt.join(Post).where(Post.site_id == site_id)
    if allowed is not None:
        stmt = stmt.where(Assignment.post_id.in_(allowed or {-1}))
    return [_assignment_out(a) for a in db.scalars(stmt.order_by(Assignment.id))]


@router.post("/assignments", status_code=201)
def create_assignment(body: AssignmentIn, user: StaffManagerUser, request: Request, db: DB):
    _check_assignment(db, user, body.user_id, body.post_id, body.role_on_post)
    a = Assignment(**body.model_dump())
    db.add(a)
    db.flush()
    activity.log(db, user, "assignment_created", "assignment", a.id, post_id=a.post_id, device=device_of(request))
    db.commit()
    db.refresh(a)
    return _assignment_out(a)


@router.patch("/assignments/{assignment_id}")
def update_assignment(assignment_id: int, body: AssignmentPatch, user: StaffManagerUser, db: DB):
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "Penugasan tidak ditemukan")
    if user.role == "supervisor" and a.post.site_id != user.site_id:
        raise HTTPException(403, "Di luar lokasi kamu")
    data = body.model_dump(exclude_unset=True)
    _check_assignment(db, user, a.user_id, data.get("post_id", a.post_id), data.get("role_on_post", a.role_on_post))
    for k, v in data.items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return _assignment_out(a)


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, user: StaffManagerUser, request: Request, db: DB):
    a = db.get(Assignment, assignment_id)
    if not a:
        return
    _own_client(user, a.post.site.client_id)
    if user.role == "supervisor" and a.post.site_id != user.site_id:
        raise HTTPException(403, "Di luar lokasi kamu")
    activity.log(db, user, "assignment_deleted", "assignment", a.id, post_id=a.post_id, device=device_of(request))
    db.delete(a)
    db.commit()
