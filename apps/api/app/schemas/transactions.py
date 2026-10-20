import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Side = Literal["depan", "belakang", "kiri", "kanan", "detail"]


class CheckIn(BaseModel):
    item_id: str
    checked: bool = False
    # Id kondisi dari template (mis. mulus/penyok/lecet). Kalau diisi, `checked` dihitung dari kondisi.
    condition: str | None = None
    note: str | None = None


class InsideIn(BaseModel):
    item_id: str
    present: bool
    extra_text: str | None = None


class PhotoIn(BaseModel):
    client_id: uuid.UUID
    side: Side
    item_id: str | None = None
    taken_at: datetime | None = None


class CheckinCreate(BaseModel):
    client_id: uuid.UUID
    post_id: int
    template_version_id: int
    ticket_code: str | None = None
    plate: str = Field(min_length=2, max_length=20)
    vehicle_type: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=40)
    make_model: str | None = Field(default=None, max_length=120)
    slot: str | None = Field(default=None, max_length=40)
    key_tag: str | None = Field(default=None, max_length=40)
    owner_phone: str | None = Field(default=None, max_length=32)
    vip: bool = False
    checks: list[CheckIn] = []
    inside_items: list[InsideIn] = []
    notes: str | None = None
    photos: list[PhotoIn] = []
    checkin_at: datetime | None = None


class IncidentCreate(BaseModel):
    client_id: uuid.UUID
    parts: list[str] = []
    note: str | None = None
    photos: list[PhotoIn] = []


class Checkout(BaseModel):
    client_id: uuid.UUID
    checks: list[CheckIn] = []
    inside_items: list[InsideIn] = []
    photos: list[PhotoIn] = []
    has_new_damage: bool
    incident: IncidentCreate | None = None
    notes: str | None = None
    checkout_at: datetime | None = None


class Decision(BaseModel):
    decision: Literal["no_damage", "damage_confirmed"]
    note: str | None = None


class PresignRequest(BaseModel):
    photo_ids: list[uuid.UUID] = Field(min_length=1, max_length=40)


class CompleteRequest(BaseModel):
    photo_ids: list[uuid.UUID] = Field(min_length=1, max_length=40)
