# CLAUDE.md — Ceklis

Baca `PRD.md` dulu; itu sumber kebenaran (alur, aturan, model data, API).

## Konteks
- Monorepo: `apps/api` (FastAPI, Python 3.12, uv) + `apps/web` (Next.js App Router, TS, Tailwind, pnpm). Satu app web untuk PWA petugas `(petugas)/` dan admin `admin/`.
- Produk turunan Nopol: gaya hitam + kuning `#F5C518`, token di PRD §12.
- PWA dipakai di HP di basement: offline-first (PRD §8) bukan tambahan, rancang dari awal.

## Design
- Mockup di `design/*.dc.html` (format canvas, butuh runtime khusus — jangan coba render). Baca markup + inline style untuk layout, copy, ukuran, warna. Data di mockup = contoh.
- Copy UI Bahasa Indonesia, ikuti design.

## Aturan kerja
- Kerjakan per milestone PRD §13, berurutan; tiap milestone: migration + test + update `.env.example`.
- Checklist & ringkasan dibaca dari template (PRD §6), jangan hardcode item.
- Transaksi menyimpan snapshot item template saat check in.
- Semua endpoint tulis dari PWA idempoten via `client_id`.
- Foto diupload langsung ke storage pakai presigned URL; API tidak menerima file foto.
- Scope query sesuai peran & penugasan (petugas hanya pos-nya).
- Hal di "Keputusan terbuka" (PRD §14): pakai default tertulis, tandai `TODO(decision)`.
