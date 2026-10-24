"""Seed data.

    python -m app.seed --base   # template "Standar Mobil" + super admin awal (idempoten)
    python -m app.seed --demo   # + contoh Pakuwon / TSM, petugas & supervisor untuk dev
"""
import argparse
import os
import secrets
from datetime import time

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_secret
from app.models import Assignment, ChecklistTemplate, Client, Post, Site, TemplateVersion, User
from app.services.template_config import STANDAR_MOBIL


def seed_base(db, demo: bool = False) -> ChecklistTemplate:
    tpl = db.scalar(select(ChecklistTemplate).where(ChecklistTemplate.name == "Standar Mobil",
                                                    ChecklistTemplate.client_id.is_(None)))
    config = STANDAR_MOBIL.model_dump(mode="json")
    if not tpl:
        tpl = ChecklistTemplate(name="Standar Mobil", client_id=None)
        tpl.versions.append(TemplateVersion(version=1, config=config))
        db.add(tpl)
        print("+ template Standar Mobil")
    elif tpl.latest and tpl.latest.config != config:
        # Template default ikut kode: perubahan = versi baru, transaksi lama tetap pakai snapshot versinya
        version = tpl.latest.version + 1
        tpl.versions.append(TemplateVersion(version=version, config=config))
        print(f"+ template Standar Mobil v{version}")
    email = os.environ.get("SEED_ADMIN_EMAIL", "admin@ceklis.local").lower()
    if not db.scalar(select(User).where(User.role == "super_admin")):
        password = os.environ.get("SEED_ADMIN_PASSWORD") or ("ceklis-admin" if demo else None)
        generated = password is None
        if generated:
            # Produksi tanpa SEED_ADMIN_PASSWORD: jangan pakai password default yang tertulis di README
            password = secrets.token_urlsafe(12)
        db.add(User(name="Super Admin", email=email, role="super_admin", password_hash=hash_secret(password)))
        note = f" — password awal (simpan, hanya tampil sekali): {password}" if generated else ""
        print(f"+ super admin {email}{note}")
    db.commit()
    return tpl


def _get_or_create(db, model, defaults=None, **where):
    obj = db.scalar(select(model).filter_by(**where))
    if obj:
        return obj
    obj = model(**where, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj


def seed_demo(db, tpl: ChecklistTemplate) -> None:
    pakuwon = _get_or_create(db, Client, name="Pakuwon Group")
    tsm = _get_or_create(db, Client, name="Trans Studio Mall")
    pms = _get_or_create(db, Site, name="Pakuwon Mall Surabaya", client_id=pakuwon.id,
                         defaults={"address": "Jl. Puncak Indah Lontar No.2, Surabaya", "template_id": tpl.id})
    pmy = _get_or_create(db, Site, name="Pakuwon Mall Yogyakarta", client_id=pakuwon.id,
                         defaults={"address": "Jl. Ring Road Utara, Yogyakarta", "template_id": tpl.id})
    tsmb = _get_or_create(db, Site, name="TSM Bandung", client_id=tsm.id,
                          defaults={"address": "Jl. Gatot Subroto No.289, Bandung", "template_id": tpl.id})
    lobbies = [_get_or_create(db, Post, site_id=pms.id, name=f"Lobby {i}") for i in range(1, 7)]
    _get_or_create(db, Post, site_id=pmy.id, name="Lobby Utama")
    _get_or_create(db, Post, site_id=tsmb.id, name="Lobby Utama")

    pin = hash_secret("123456")
    budi = _get_or_create(db, User, phone="081234567890", defaults={
        "name": "Budi Santoso", "staff_code": "PTG-0214", "role": "petugas", "pin_hash": pin,
        "client_id": pakuwon.id})
    rina = _get_or_create(db, User, phone="081234567891", defaults={
        "name": "Rina Wulandari", "staff_code": "PTG-0215", "role": "petugas", "pin_hash": pin,
        "client_id": pakuwon.id})
    hendra = _get_or_create(db, User, phone="081234567892", defaults={
        "name": "Hendra", "staff_code": "SPV-0031", "role": "supervisor", "pin_hash": pin,
        "email": "hendra@ceklis.local", "password_hash": hash_secret("ceklis-spv"), "client_id": pakuwon.id})
    _get_or_create(db, User, email="ops@pakuwon.local", defaults={
        "name": "Ops Pakuwon", "role": "client_admin", "password_hash": hash_secret("ceklis-klien"),
        "client_id": pakuwon.id})

    lobby2 = lobbies[1]
    _get_or_create(db, Assignment, user_id=budi.id, post_id=lobby2.id, role_on_post="petugas",
                   defaults={"shift_name": "Shift pagi", "shift_start": time(7), "shift_end": time(15)})
    _get_or_create(db, Assignment, user_id=budi.id, post_id=lobbies[0].id, role_on_post="petugas",
                   defaults={"shift_name": "Shift sore", "shift_start": time(15), "shift_end": time(23)})
    _get_or_create(db, Assignment, user_id=rina.id, post_id=lobby2.id, role_on_post="petugas",
                   defaults={"shift_name": "Shift pagi", "shift_start": time(7), "shift_end": time(15)})
    for lobby in lobbies:
        _get_or_create(db, Assignment, user_id=hendra.id, post_id=lobby.id, role_on_post="supervisor")
    db.commit()
    print("+ demo: Pakuwon Mall Surabaya (Lobby 1–6), Pakuwon Mall Yogyakarta, TSM Bandung")
    print("  petugas Budi: 081234567890 / PIN 123456 · supervisor hendra@ceklis.local / ceklis-spv")
    print("  admin klien ops@pakuwon.local / ceklis-klien")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", action="store_true")
    p.add_argument("--demo", action="store_true")
    args = p.parse_args()
    with SessionLocal() as db:
        tpl = seed_base(db, demo=args.demo)
        if args.demo:
            seed_demo(db, tpl)


if __name__ == "__main__":
    main()
