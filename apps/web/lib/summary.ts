// Generator ringkasan otomatis (PRD §4.5). Versi Python: apps/api/app/services/summary.py — jaga tetap sama.
import type { TemplateConfig } from "./types";

export type InsideState = Record<string, { present: boolean; extra?: string | null }>;

export function exteriorItems(config: TemplateConfig) {
  return config.groups.flatMap((g) => g.items.filter((i) => i.kind === "exterior").map((i) => ({ ...i, group: g.title })));
}

export function insideItems(config: TemplateConfig) {
  return config.groups.flatMap((g) => g.items.filter((i) => i.kind === "inside_item"));
}

export interface SummaryRow {
  label: string;
  value: string;
  ok: boolean;
}

export function summaryRows(config: TemplateConfig, checked: Record<string, boolean>): SummaryRow[] {
  const labels = Object.fromEntries(exteriorItems(config).map((i) => [i.id, i.label]));
  return config.summary_lines.map((line) => {
    const missing = line.item_ids.filter((id) => !checked[id]).map((id) => (labels[id] ?? id).toLowerCase());
    return { label: line.label, ok: missing.length === 0, value: missing.length ? `Perlu dicek (${missing.join(", ")})` : "Baik" };
  });
}

export function insideList(config: TemplateConfig, inside: InsideState): string {
  const present = insideItems(config)
    .filter((it) => inside[it.id]?.present)
    .map((it) => {
      const extra = (inside[it.id]?.extra ?? "").trim();
      return extra ? `${it.label} (${extra})` : it.label;
    });
  return present.length ? present.join(", ") : "Tidak ada";
}

export function buildSummary(
  config: TemplateConfig,
  plate: string,
  checked: Record<string, boolean>,
  inside: InsideState,
  notes: string | null | undefined,
): string {
  return [
    config.summary_title,
    `Nomor polisi: ${plate}`,
    ...summaryRows(config, checked).map((r) => `${r.label}: ${r.value}`),
    `Barang: ${insideList(config, inside)}`,
    `Catatan: ${(notes ?? "").trim() || "-"}`,
  ].join("\n");
}
