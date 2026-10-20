import os
import uuid
from datetime import time

import pytest

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://ceklis:ceklis@localhost:5432/ceklis_test"
)
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ["SESSION_COOKIE_SECURE"] = "false"

from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_secret  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Assignment, ChecklistTemplate, Client, Post, Site, TemplateVersion, User  # noqa: E402
from app.routers import auth  # noqa: E402
from app.services.template_config import STANDAR_MOBIL  # noqa: E402

PIN = "246810"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean():
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    auth._fails.clear()
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


class World:
    """Dua klien, dua lokasi, beberapa pos, petugas & supervisor."""

    def __init__(self, db):
        self.db = db
        tpl = ChecklistTemplate(name="Standar Mobil")
        tpl.versions.append(TemplateVersion(version=1, config=STANDAR_MOBIL.model_dump(mode="json")))
        db.add(tpl)
        db.flush()
        self.template = tpl
        self.client = Client(name="Pakuwon Group")
        self.other_client = Client(name="Trans Studio Mall")
        db.add_all([self.client, self.other_client])
        db.flush()
        self.site = Site(client_id=self.client.id, name="Pakuwon Mall Surabaya", template_id=tpl.id)
        self.other_site = Site(client_id=self.other_client.id, name="TSM Bandung", template_id=tpl.id)
        db.add_all([self.site, self.other_site])
        db.flush()
        self.lobby1 = Post(site_id=self.site.id, name="Lobby 1")
        self.lobby2 = Post(site_id=self.site.id, name="Lobby 2")
        self.tsm_lobby = Post(site_id=self.other_site.id, name="Lobby Utama")
        db.add_all([self.lobby1, self.lobby2, self.tsm_lobby])
        db.flush()
        pin = hash_secret(PIN)
        self.budi = User(name="Budi", phone="081111111111", staff_code="PTG-0001", role="petugas", pin_hash=pin,
                         client_id=self.client.id)
        self.rina = User(name="Rina", phone="081111111112", staff_code="PTG-0002", role="petugas", pin_hash=pin,
                         client_id=self.client.id)
        self.asep = User(name="Asep", phone="081111111113", staff_code="PTG-0003", role="petugas", pin_hash=pin,
                         client_id=self.other_client.id)
        self.hendra = User(name="Hendra", phone="081111111114", role="supervisor", pin_hash=pin,
                           email="hendra@x.id", password_hash=hash_secret("rahasia-spv"), client_id=self.client.id)
        self.ops = User(name="Ops", email="ops@x.id", role="client_admin", password_hash=hash_secret("rahasia-ops"),
                        client_id=self.client.id)
        self.root = User(name="Root", email="root@x.id", role="super_admin", password_hash=hash_secret("rahasia-root"))
        db.add_all([self.budi, self.rina, self.asep, self.hendra, self.ops, self.root])
        db.flush()
        db.add_all([
            Assignment(user_id=self.budi.id, post_id=self.lobby2.id, shift_start=time(0), shift_end=time(23, 59)),
            Assignment(user_id=self.rina.id, post_id=self.lobby1.id),
            Assignment(user_id=self.asep.id, post_id=self.tsm_lobby.id),
            Assignment(user_id=self.hendra.id, post_id=self.lobby2.id, role_on_post="supervisor"),
        ])
        db.commit()

    @property
    def version_id(self) -> int:
        return self.template.versions[0].id


@pytest.fixture
def world(db) -> World:
    return World(db)


def login_petugas(user: User) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/petugas/login", json={"login": user.phone, "pin": PIN})
    assert r.status_code == 200, r.text
    return c


def login_admin(email: str, password: str) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/admin/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


ALL_ITEMS = [it.id for it in STANDAR_MOBIL.exterior_items()]


def photos(*sides: str) -> list[dict]:
    return [{"client_id": str(uuid.uuid4()), "side": s} for s in (sides or ("depan", "belakang", "kiri", "kanan"))]


def checkin_payload(world: World, plate: str = "B 1234 ABC", **over) -> dict:
    body = {
        "client_id": str(uuid.uuid4()),
        "post_id": world.lobby2.id,
        "template_version_id": world.version_id,
        "plate": plate,
        "vehicle_type": "SUV / MPV",
        "color": "Hitam",
        "make_model": "Toyota Fortuner",
        "slot": "B2-14",
        "key_tag": "K-027",
        "checks": [{"item_id": i, "checked": True} for i in ALL_ITEMS],
        "inside_items": [{"item_id": "etoll", "present": True}, {"item_id": "hp", "present": True}],
        "photos": photos(),
    }
    body.update(over)
    return body


def checkout_payload(**over) -> dict:
    body = {"client_id": str(uuid.uuid4()), "photos": photos(), "has_new_damage": False,
            "inside_items": [{"item_id": "etoll", "present": True}]}
    body.update(over)
    return body
