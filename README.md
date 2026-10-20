# ceklis-nopol

**Ceklis** — aplikasi checklist valet (produk turunan Nopol). Petugas mencatat kondisi kendaraan saat
check in / check out lewat **PWA** di HP (offline-first), admin memantau semua lokasi lewat dashboard web.
Spesifikasi lengkap: [`PRD.md`](PRD.md). Mockup: [`design/`](design/).

```
apps/api   FastAPI · Python 3.12 · SQLAlchemy 2 + Alembic · arq (Redis) · uv
apps/web   Next.js 15 (App Router) · Tailwind v4 · Serwist (PWA) · Dexie (IndexedDB) · pnpm
packages/design-tokens   warna & font Nopol
```

## Jalankan lokal

Butuh Docker, `uv`, Node 20+ dan `pnpm`.

```bash
cp .env.example .env
docker compose up -d db redis storage        # Postgres 16, Redis, storage S3-compatible (RustFS)

cd apps/api
uv sync
uv run alembic upgrade head
uv run python -m app.seed --demo             # template "Standar Mobil" + data contoh
uv run uvicorn app.main:app --reload --port 8000
uv run arq app.jobs.worker.WorkerSettings    # (terminal lain) thumbnail & retensi foto

cd ../..   # root repo
pnpm install
pnpm dev:web                                 # http://localhost:3000 — /api diteruskan ke FastAPI
```

Untuk dibagikan / dicoba orang lain (mis. lewat tunnel), pakai build produksi — jauh lebih ringan dari dev server
(JS halaman login ±177 KB vs ±9 MB): `pnpm preview:web`.

Semua sekaligus (build image): `docker compose up --build` → web di :3000, API di :8000.

Akun demo (`--demo`, hanya untuk dev):

| Peran | Masuk di | Login |
|---|---|---|
| Petugas (Lobby 2, PMS) | `/masuk` | `081234567890` · PIN `123456` |
| Supervisor (Lobby 1–6) | `/admin/login` | `hendra@ceklis.local` · `ceklis-spv` |
| Admin klien Pakuwon | `/admin/login` | `ops@pakuwon.local` · `ceklis-klien` |
| Super admin | `/admin/login` | `admin@ceklis.local` · `ceklis-admin` (atur `SEED_ADMIN_*` di produksi) |

## Test

```bash
pnpm test:api     # pytest: idempotensi client_id, state machine, snapshot template, ringkasan, izin per peran
pnpm test:web     # vitest: generator ringkasan (sama dengan versi Python) + antrean offline
```

Test API memakai database `ceklis_test` (dibuat otomatis oleh `infra/initdb`).

## Catatan arsitektur

- **Offline-first.** Check in / check out disimpan dulu di IndexedDB (`lib/offline`), lalu dikirim berurutan.
  API idempoten terhadap `client_id` (UUID dari HP), jadi kirim ulang tidak membuat data dobel.
  Foto disimpan sebagai Blob, diunggah langsung ke storage lewat presigned URL setelah transaksinya terdaftar.
  Pemicu kirim: Background Sync (service worker), event `online`, app dibuka, interval, tombol "Kirim sekarang".
  Data yang ditolak server tidak dihapus — muncul di layar Akun.
- **Kode tiket cek list** (`CKL-DDMM-XXXXX`) dibuat di HP supaya QR tetap bisa diberikan saat offline;
  server memakai kode itu kalau valid & belum dipakai.
- **Template berversi.** Setiap simpan = versi baru; transaksi menyimpan `template_version_id` + snapshot.
  Ringkasan otomatis dibentuk dari `summary_lines` template, tidak di-hardcode.
- **Scope peran.** Petugas hanya pos penugasannya; supervisor pos yang disupervisi; admin klien semua lokasi kliennya.
- Keputusan terbuka di PRD §14 memakai default tertulis dan ditandai `TODO(decision)` di kode.
