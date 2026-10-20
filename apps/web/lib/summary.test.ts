import { describe, expect, it } from "vitest";
import { buildSummary, exteriorItems } from "./summary";
import type { TemplateConfig } from "./types";

// Sama dengan template "Standar Mobil" di apps/api/app/services/template_config.py
const item = (id: string, label: string, kind: "exterior" | "inside_item" = "exterior", free_text = false) => ({
  id, label, kind, requires_photo_if_unchecked: kind === "exterior", free_text,
});
const STANDAR: TemplateConfig = {
  photo_mode: "required_4_sides",
  required_sides: ["depan", "belakang", "kiri", "kanan"],
  summary_title: "CHECKLIST VALET",
  conditions: [{ id: "mulus", label: "Mulus", ok: true }, { id: "penyok", label: "Penyok", ok: false }, { id: "lecet", label: "Lecet", ok: false }],
  groups: [
    { id: "tampak_depan", title: "Tampak depan", items: [item("lampu_depan_kanan", "Lampu depan kanan"), item("lampu_depan_kiri", "Lampu depan kiri"), item("bamper_depan", "Bamper depan"), item("kap_mesin", "Kap mesin")] },
    { id: "tampak_samping", title: "Tampak samping", items: [item("pintu_depan_kanan", "Pintu depan kanan"), item("pintu_belakang_kanan", "Pintu belakang kanan"), item("pintu_depan_kiri", "Pintu depan kiri"), item("pintu_belakang_kiri", "Pintu belakang kiri")] },
    { id: "tampak_belakang", title: "Tampak belakang", items: [item("pintu_bagasi", "Pintu bagasi"), item("lampu_belakang_kanan", "Lampu belakang kanan"), item("lampu_belakang_kiri", "Lampu belakang kiri"), item("bamper_belakang", "Bamper belakang")] },
    { id: "lainnya", title: "Lainnya", items: [item("kaca", "Kaca depan & belakang"), item("velg_ban", "Velg & ban"), item("interior", "Interior"), item("aksesori", "Aksesori kendaraan")] },
    { id: "bagian_dalam", title: "Bagian dalam", items: [item("etoll", "Kartu e-Toll", "inside_item"), item("uang", "Uang", "inside_item"), item("laptop", "Laptop", "inside_item"), item("hp", "HP", "inside_item"), item("dll", "DLL", "inside_item", true)] },
  ],
  summary_lines: [
    { label: "Bodi depan", item_ids: ["bamper_depan", "kap_mesin"] },
    { label: "Bodi belakang", item_ids: ["pintu_bagasi", "bamper_belakang"] },
    { label: "Bodi kiri", item_ids: ["pintu_depan_kiri", "pintu_belakang_kiri"] },
    { label: "Bodi kanan", item_ids: ["pintu_depan_kanan", "pintu_belakang_kanan"] },
    { label: "Kaca depan dan belakang", item_ids: ["kaca"] },
    { label: "Lampu", item_ids: ["lampu_depan_kanan", "lampu_depan_kiri", "lampu_belakang_kanan", "lampu_belakang_kiri"] },
    { label: "Velg dan ban", item_ids: ["velg_ban"] },
    { label: "Interior", item_ids: ["interior"] },
    { label: "Aksesori kendaraan", item_ids: ["aksesori"] },
  ],
};
const ALL = Object.fromEntries(exteriorItems(STANDAR).map((i) => [i.id, true]));

describe("buildSummary (PRD §4.5)", () => {
  it("cocok dengan format klien", () => {
    expect(buildSummary(STANDAR, "B 1234 ABC", ALL, { etoll: { present: true }, hp: { present: true } }, "")).toBe(
      [
        "CHECKLIST VALET", "Nomor polisi: B 1234 ABC", "Bodi depan: Baik", "Bodi belakang: Baik", "Bodi kiri: Baik",
        "Bodi kanan: Baik", "Kaca depan dan belakang: Baik", "Lampu: Baik", "Velg dan ban: Baik", "Interior: Baik",
        "Aksesori kendaraan: Baik", "Barang: Kartu e-Toll, HP", "Catatan: -",
      ].join("\n"),
    );
  });

  it("item tidak diceklis → Perlu dicek (huruf kecil, urut template)", () => {
    const text = buildSummary(STANDAR, "L 1802 NA", { ...ALL, bamper_depan: false, kap_mesin: false }, {}, "lecet kecil");
    expect(text).toContain("Bodi depan: Perlu dicek (bamper depan, kap mesin)");
    expect(text).toContain("Barang: Tidak ada");
    expect(text.endsWith("Catatan: lecet kecil")).toBe(true);
  });

  it("kondisi disebut kalau ada (sama dengan versi Python)", () => {
    const text = buildSummary(STANDAR, "B 1 A", { ...ALL, bamper_depan: false, kap_mesin: false }, {}, null, { bamper_depan: "lecet", kap_mesin: "penyok" });
    expect(text).toContain("Bodi depan: Lecet (bamper depan), Penyok (kap mesin)");
  });

  it("DLL dengan teks bebas", () => {
    expect(buildSummary(STANDAR, "B 1 A", ALL, { dll: { present: true, extra: "payung" } }, null)).toContain("Barang: DLL (payung)");
  });
});
