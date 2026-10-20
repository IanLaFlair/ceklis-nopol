"""Generator ringkasan otomatis (PRD §4.5). Versi TS-nya ada di apps/web/lib/summary.ts — jaga tetap sama."""
from collections.abc import Mapping

from app.services.template_config import TemplateConfig


def build_summary(
    config: TemplateConfig,
    plate: str,
    checked: Mapping[str, bool],
    inside: Mapping[str, tuple[bool, str | None]],
    notes: str | None,
    conditions: Mapping[str, str] | None = None,
) -> str:
    """conditions = item_id → id kondisi (mis. 'lecet'); kalau ada, baris menyebut kondisinya."""
    labels = {it.id: it.label for it in config.exterior_items()}
    cond_label = {c.id: c.label for c in config.conditions}
    lines = [config.summary_title, f"Nomor polisi: {plate}"]
    for line in config.summary_lines:
        missing = [i for i in line.item_ids if not checked.get(i, False)]
        if not missing:
            lines.append(f"{line.label}: Baik")
            continue
        groups: dict[str, list[str]] = {}
        for i in missing:
            key = cond_label.get((conditions or {}).get(i, ""), "Perlu dicek")
            groups.setdefault(key, []).append(labels[i].lower())
        lines.append(f"{line.label}: " + ", ".join(f"{k} ({', '.join(v)})" for k, v in groups.items()))

    present = []
    for it in config.inside_items():
        on, extra = inside.get(it.id, (False, None))
        if on:
            extra = (extra or "").strip()
            present.append(f"{it.label} ({extra})" if extra else it.label)
    lines.append("Barang: " + (", ".join(present) if present else "Tidak ada"))
    lines.append("Catatan: " + ((notes or "").strip() or "-"))
    return "\n".join(lines)
