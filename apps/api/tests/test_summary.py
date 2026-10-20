from app.services.summary import build_summary
from app.services.template_config import STANDAR_MOBIL, SummaryLine, TemplateConfig

ALL = {it.id: True for it in STANDAR_MOBIL.exterior_items()}


def test_semua_baik_sesuai_format_klien():
    text = build_summary(STANDAR_MOBIL, "B 1234 ABC", ALL,
                         {"etoll": (True, None), "hp": (True, None)}, None)
    assert text == "\n".join([
        "CHECKLIST VALET",
        "Nomor polisi: B 1234 ABC",
        "Bodi depan: Baik",
        "Bodi belakang: Baik",
        "Bodi kiri: Baik",
        "Bodi kanan: Baik",
        "Kaca depan dan belakang: Baik",
        "Lampu: Baik",
        "Velg dan ban: Baik",
        "Interior: Baik",
        "Aksesori kendaraan: Baik",
        "Barang: Kartu e-Toll, HP",
        "Catatan: -",
    ])


def test_item_tidak_diceklis_jadi_perlu_dicek():
    checked = {**ALL, "bamper_depan": False, "kap_mesin": False}
    text = build_summary(STANDAR_MOBIL, "L 1802 NA", checked, {}, "lecet kecil")
    assert "Bodi depan: Perlu dicek (bamper depan, kap mesin)" in text
    assert "Barang: Tidak ada" in text
    assert text.endswith("Catatan: lecet kecil")


def test_dll_dengan_teks_bebas():
    text = build_summary(STANDAR_MOBIL, "B 1 A", ALL, {"dll": (True, "payung")}, "")
    assert "Barang: DLL (payung)" in text


def test_pemetaan_dibaca_dari_template_bukan_hardcode():
    cfg = TemplateConfig.model_validate({
        **STANDAR_MOBIL.model_dump(),
        "summary_title": "CEK KENDARAAN",
        "summary_lines": [SummaryLine(label="Lampu", item_ids=["lampu_depan_kiri"]).model_dump()],
    })
    text = build_summary(cfg, "B 1 A", {"lampu_depan_kiri": False}, {}, None)
    assert text.splitlines()[:3] == ["CEK KENDARAAN", "Nomor polisi: B 1 A", "Lampu: Perlu dicek (lampu depan kiri)"]
    assert "Bodi depan" not in text


def test_template_menolak_ringkasan_ke_item_yang_tidak_ada():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        TemplateConfig.model_validate({
            **STANDAR_MOBIL.model_dump(),
            "summary_lines": [{"label": "X", "item_ids": ["tidak_ada"]}],
        })


def test_kondisi_disebut_di_ringkasan():
    checked = {**ALL, "bamper_depan": False, "kap_mesin": False}
    text = build_summary(STANDAR_MOBIL, "B 1 A", checked, {}, None, {"bamper_depan": "lecet", "kap_mesin": "lecet"})
    assert "Bodi depan: Lecet (bamper depan, kap mesin)" in text
