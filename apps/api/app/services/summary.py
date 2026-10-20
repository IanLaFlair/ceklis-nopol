"""Generator ringkasan otomatis (PRD §4.5). Versi TS-nya ada di apps/web/lib/summary.ts — jaga tetap sama."""
from collections.abc import Mapping

from app.services.template_config import TemplateConfig


def build_summary(
    config: TemplateConfig,
    plate: str,
    checked: Mapping[str, bool],
    inside: Mapping[str, tuple[bool, str | None]],
    notes: str | None,
) -> str:
    labels = {it.id: it.label for it in config.exterior_items()}
    lines = [config.summary_title, f"Nomor polisi: {plate}"]
    for line in config.summary_lines:
        missing = [labels[i].lower() for i in line.item_ids if not checked.get(i, False)]
        lines.append(f"{line.label}: " + (f"Perlu dicek ({', '.join(missing)})" if missing else "Baik"))

    present = []
    for it in config.inside_items():
        on, extra = inside.get(it.id, (False, None))
        if on:
            extra = (extra or "").strip()
            present.append(f"{it.label} ({extra})" if extra else it.label)
    lines.append("Barang: " + (", ".join(present) if present else "Tidak ada"))
    lines.append("Catatan: " + ((notes or "").strip() or "-"))
    return "\n".join(lines)
