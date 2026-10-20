import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.org import Post, Site, User

STATUSES = ("parked", "incident_pending", "incident_confirmed", "released")
SIDES = ("depan", "belakang", "kiri", "kanan", "detail")


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    plate_normalized: Mapped[str] = mapped_column(String(20), unique=True)
    plate_display: Mapped[str] = mapped_column(String(20))
    make_model: Mapped[str | None] = mapped_column(String(120))
    color: Mapped[str | None] = mapped_column(String(40))
    type: Mapped[str | None] = mapped_column(String(40))


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_post_status", "post_id", "status"),
        Index("ix_transactions_plate", "plate_normalized"),
        Index("ix_transactions_site_checkin", "site_id", text("checkin_at DESC")),
        Index(
            "uq_transactions_parked_plate_site", "site_id", "plate_normalized",
            unique=True, postgresql_where=text("status = 'parked'"),
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id_uuid: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    template_version_id: Mapped[int] = mapped_column(ForeignKey("template_versions.id"))
    template_snapshot: Mapped[dict] = mapped_column(JSONB)
    plate: Mapped[str] = mapped_column(String(20))
    plate_normalized: Mapped[str] = mapped_column(String(20))
    vehicle_type: Mapped[str | None] = mapped_column(String(40))
    color: Mapped[str | None] = mapped_column(String(40))
    make_model: Mapped[str | None] = mapped_column(String(120))
    slot: Mapped[str | None] = mapped_column(String(40))
    key_tag: Mapped[str | None] = mapped_column(String(40))
    owner_phone: Mapped[str | None] = mapped_column(String(32))
    vip: Mapped[bool] = mapped_column(Boolean, default=False)
    ticket_code: Mapped[str] = mapped_column(String(32), unique=True)
    status: Mapped[str] = mapped_column(String(24), default="parked")
    checkin_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checkin_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    checkout_client_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, unique=True)
    checkout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checkout_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    checkout_notes: Mapped[str | None] = mapped_column(Text)
    summary_text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post: Mapped[Post] = relationship()
    site: Mapped[Site] = relationship()
    checkin_user: Mapped[User] = relationship(foreign_keys=[checkin_by])
    checkout_user: Mapped[User | None] = relationship(foreign_keys=[checkout_by])
    checks: Mapped[list["TransactionCheck"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan", order_by="TransactionCheck.position"
    )
    inside_items: Mapped[list["TransactionInsideItem"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan", order_by="TransactionInsideItem.position"
    )
    photos: Mapped[list["Photo"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan", order_by="Photo.id"
    )
    incidents: Mapped[list["Incident"]] = relationship(
        back_populates="transaction", order_by="Incident.id"
    )


class TransactionCheck(Base):
    __tablename__ = "transaction_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    phase: Mapped[str] = mapped_column(String(3))
    item_id: Mapped[str] = mapped_column(String(64))
    label_snapshot: Mapped[str] = mapped_column(String(120))
    group_snapshot: Mapped[str] = mapped_column(String(120))
    checked: Mapped[bool] = mapped_column(Boolean)
    note: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(default=0)

    transaction: Mapped[Transaction] = relationship(back_populates="checks")


class TransactionInsideItem(Base):
    __tablename__ = "transaction_inside_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    phase: Mapped[str] = mapped_column(String(3))
    item_id: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(120))
    present: Mapped[bool] = mapped_column(Boolean)
    extra_text: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(default=0)

    transaction: Mapped[Transaction] = relationship(back_populates="inside_items")


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id_uuid: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"))
    phase: Mapped[str] = mapped_column(String(3))
    side: Mapped[str] = mapped_column(String(10))
    item_id: Mapped[str | None] = mapped_column(String(64))
    object_key: Mapped[str] = mapped_column(String(300), unique=True)
    thumb_key: Mapped[str | None] = mapped_column(String(300))
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    transaction: Mapped[Transaction] = relationship(back_populates="photos")


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id_uuid: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    parts: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    reported_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str | None] = mapped_column(String(20))
    decision_note: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    transaction: Mapped[Transaction] = relationship(back_populates="incidents")
    reporter: Mapped[User] = relationship(foreign_keys=[reported_by])
    decider: Mapped[User | None] = relationship(foreign_keys=[decided_by])
    photos: Mapped[list[Photo]] = relationship(foreign_keys=[Photo.incident_id], viewonly=True)
