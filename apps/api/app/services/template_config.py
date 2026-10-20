"""Skema konfigurasi template checklist (PRD §6) + template default "Standar Mobil"."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

PhotoMode = Literal["required_4_sides", "only_when_unchecked", "off"]
Side = Literal["depan", "belakang", "kiri", "kanan"]
ALL_SIDES: list[Side] = ["depan", "belakang", "kiri", "kanan"]


class TemplateItem(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    label: str = Field(min_length=1, max_length=120)
    kind: Literal["exterior", "inside_item"] = "exterior"
    requires_photo_if_unchecked: bool = False
    # Untuk barang di dalam: "DLL" bisa diisi teks bebas
    free_text: bool = False


class TemplateGroup(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    title: str = Field(min_length=1, max_length=120)
    items: list[TemplateItem]


class SummaryLine(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    item_ids: list[str] = Field(min_length=1)


class TemplateConfig(BaseModel):
    photo_mode: PhotoMode = "required_4_sides"
    required_sides: list[Side] = Field(default_factory=lambda: list(ALL_SIDES))
    groups: list[TemplateGroup]
    summary_title: str = "CHECKLIST VALET"
    summary_lines: list[SummaryLine] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_ids(self) -> "TemplateConfig":
        seen: set[str] = set()
        for g in self.groups:
            for it in g.items:
                if it.id in seen:
                    raise ValueError(f"id item duplikat: {it.id}")
                seen.add(it.id)
        exterior = {it.id for it in self.exterior_items()}
        for line in self.summary_lines:
            missing = [i for i in line.item_ids if i not in exterior]
            if missing:
                raise ValueError(f"baris ringkasan '{line.label}' merujuk item yang tidak ada: {', '.join(missing)}")
        return self

    def exterior_items(self) -> list[TemplateItem]:
        return [it for g in self.groups for it in g.items if it.kind == "exterior"]

    def inside_items(self) -> list[TemplateItem]:
        return [it for g in self.groups for it in g.items if it.kind == "inside_item"]

    def group_of(self) -> dict[str, str]:
        return {it.id: g.title for g in self.groups for it in g.items}

    def sides_required(self) -> list[str]:
        return list(self.required_sides) if self.photo_mode == "required_4_sides" else []

    def item_photo_required(self, item: TemplateItem) -> bool:
        return self.photo_mode != "off" and item.requires_photo_if_unchecked


def _items(*pairs: tuple[str, str], photo: bool = True) -> list[TemplateItem]:
    return [TemplateItem(id=i, label=label, requires_photo_if_unchecked=photo) for i, label in pairs]


STANDAR_MOBIL = TemplateConfig(
    photo_mode="required_4_sides",
    groups=[
        TemplateGroup(id="tampak_depan", title="Tampak depan", items=_items(
            ("lampu_depan_kanan", "Lampu depan kanan"), ("lampu_depan_kiri", "Lampu depan kiri"),
            ("bamper_depan", "Bamper depan"), ("kap_mesin", "Kap mesin"),
        )),
        TemplateGroup(id="tampak_samping", title="Tampak samping", items=_items(
            ("pintu_depan_kanan", "Pintu depan kanan"), ("pintu_belakang_kanan", "Pintu belakang kanan"),
            ("pintu_depan_kiri", "Pintu depan kiri"), ("pintu_belakang_kiri", "Pintu belakang kiri"),
        )),
        TemplateGroup(id="tampak_belakang", title="Tampak belakang", items=_items(
            ("pintu_bagasi", "Pintu bagasi"), ("lampu_belakang_kanan", "Lampu belakang kanan"),
            ("lampu_belakang_kiri", "Lampu belakang kiri"), ("bamper_belakang", "Bamper belakang"),
        )),
        TemplateGroup(id="lainnya", title="Lainnya", items=_items(
            ("kaca", "Kaca depan & belakang"), ("velg_ban", "Velg & ban"),
            ("interior", "Interior"), ("aksesori", "Aksesori kendaraan"),
        )),
        TemplateGroup(id="bagian_dalam", title="Bagian dalam", items=[
            TemplateItem(id="etoll", label="Kartu e-Toll", kind="inside_item"),
            TemplateItem(id="uang", label="Uang", kind="inside_item"),
            TemplateItem(id="laptop", label="Laptop", kind="inside_item"),
            TemplateItem(id="hp", label="HP", kind="inside_item"),
            TemplateItem(id="dll", label="DLL", kind="inside_item", free_text=True),
        ]),
    ],
    summary_lines=[
        SummaryLine(label="Bodi depan", item_ids=["bamper_depan", "kap_mesin"]),
        SummaryLine(label="Bodi belakang", item_ids=["pintu_bagasi", "bamper_belakang"]),
        SummaryLine(label="Bodi kiri", item_ids=["pintu_depan_kiri", "pintu_belakang_kiri"]),
        SummaryLine(label="Bodi kanan", item_ids=["pintu_depan_kanan", "pintu_belakang_kanan"]),
        SummaryLine(label="Kaca depan dan belakang", item_ids=["kaca"]),
        SummaryLine(label="Lampu", item_ids=[
            "lampu_depan_kanan", "lampu_depan_kiri", "lampu_belakang_kanan", "lampu_belakang_kiri",
        ]),
        SummaryLine(label="Velg dan ban", item_ids=["velg_ban"]),
        SummaryLine(label="Interior", item_ids=["interior"]),
        SummaryLine(label="Aksesori kendaraan", item_ids=["aksesori"]),
    ],
)
