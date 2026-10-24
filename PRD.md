# PRD — Ceklis (checklist valet)

Status: draft v1 · 20 Okt 2026 · Owner: Peace
Domain: `ceklis.nopol-lpr.com` · Produk turunan **Nopol** (warna & gaya sama).
Bahasa UI: Indonesia.

---

## 0. Perubahan alur (Okt 2026) — berlaku di atas bagian lain

Hasil review klien setelah demo; bagian PRD di bawah yang bertentangan mengikuti ini.

**Check In (PWA) — 2 langkah**
1. *Nomor polisi*: scan plat (§9) atau ketik. Jenis, warna, merek/model, slot, no. gantungan kunci, no. WA pemilik **tidak ditanyakan**.
2. *Checklist*: tiap bagian luar **wajib** dipilih salah satu kondisi dari template (default **Mulus / Penyok / Lecet**), menggantikan centang + catatan per item. Tidak ada "Ceklis semua". Foto close-up untuk Penyok/Lecet opsional (kecuali template mewajibkan). *Barang di dalam* yang dicentang **wajib difoto** (`requires_photo_if_present`). Catatan umum opsional.
- **Tanpa** foto 4 sisi (template default `photo_mode: off`), **tanpa** ringkasan otomatis di layar, **tanpa** tiket cek list / QR / WhatsApp — tidak ada yang dikirim ke pelanggan. Selesai = layar "Check in berhasil".
- Server tetap menyimpan `summary_text` dan kode tiket internal (untuk admin & laporan).

**Check Out (PWA)**
- Tombol Check Out → daftar kendaraan masih parkir (cari nopol) → detail (masuk jam/oleh siapa, lama parkir, barang, kondisi saat masuk) → konfirmasi "Yakin ingin check out?" → selesai.
- Tanpa scan QR, tanpa foto ulang, tanpa pertanyaan kerusakan baru. Nama staf yang check out dicatat dan ditampilkan.
- Alur insiden (§4.3, §5 /admin/insiden) tetap ada di API & admin, tapi **tidak dipicu dari PWA**. *Keputusan terbuka:* hapus, atau tambah tombol "Laporkan kerusakan" di check out.

**Template (§6)** — tambahan `conditions: [{id, label, ok}]` (diatur di editor admin) dan `requires_photo_if_present` per barang di dalam. `transaction_checks.condition` menyimpan pilihan kondisi.

**Akun (PWA)** — status antrean offline, toggle notifikasi/kompres, dan panduan dihapus. Antrean offline tetap jalan otomatis; data yang **ditolak server** muncul sebagai peringatan di Beranda.

**Scan plat (§9)** — panggil **engine Nopol on-prem** di LAN lokasi: `POST {NOPOL_API_URL}/recognize` (multipart `image`, opsional `vehicle`), tanpa auth per-request (lisensi diaktifkan di engine). Hasil ditentukan dari `status`: `success` → `plate` + `confidence` (0..1); `plate_not_detected` / `plate_unreadable` → minta ketik manual; HTTP 402/403 → lisensi engine tidak aktif; 400 → gambar tidak valid. Confidence cenderung terlalu yakin, jadi hasil scan **selalu** ditampilkan untuk dicocokkan petugas (ambang konfirmasi 0.97). Cloud `api.nopol-lpr.com` tidak punya API recognize server-to-server (playground khusus login web; license key bukan API key) — kalau butuh, itu fitur baru di nopol-lpr. Dev: container `lpr-local` (`nopol-engine:local`) di `localhost:8001`.

---

## 1. Ringkasan

Ceklis adalah aplikasi untuk petugas valet mencatat kondisi kendaraan saat **masuk (check in)** dan **keluar (check out)**: checklist cukup diklik, foto 4 sisi, barang di dalam, dan perbandingan kondisi saat serah terima. Dipakai di HP sebagai **PWA**. Admin memantau semua lokasi lewat **dashboard web**.

Lokasinya banyak dan bertingkat, contoh:

- Pakuwon Group → Pakuwon Mall Surabaya → Lobby 1, 2, 3, 4, 5, 6
- Pakuwon Group → Pakuwon Mall Yogyakarta → Lobby Utama
- Trans Studio Mall → TSM Bandung → Lobby Utama

### Tujuan v1
- Check in selesai < 60 detik per kendaraan.
- Setiap transaksi punya bukti: checklist + foto masuk + foto keluar.
- Perbedaan kondisi saat keluar masuk ke alur insiden dan diputuskan supervisor.
- Tetap bisa dipakai saat sinyal jelek (basement): data antre di HP, terkirim otomatis.

### Non-goals v1
- Pembayaran / tarif parkir valet.
- Integrasi gate atau sistem parkir.
- Aplikasi native (cukup PWA).
- WhatsApp Business API (v1 cukup link `wa.me` dengan teks terisi).

---

## 2. Stack

Disamakan dengan `nopol-cloud` supaya tim tidak pindah konteks.

| Lapisan | Pilihan | Catatan |
|---|---|---|
| Repo | **Monorepo** `ceklis/` | `apps/api` + `apps/web` |
| API | FastAPI (Python 3.12), Pydantic v2, SQLAlchemy 2 + Alembic, `uv` | |
| DB | PostgreSQL 16 | |
| Storage foto | S3-compatible (Alibaba OSS / Supabase Storage / R2) via **presigned URL** | Upload langsung dari HP, API tidak menerima file besar |
| Queue / job | Redis + arq | Thumbnail, notifikasi, laporan |
| Web | **Next.js 15 (App Router, TypeScript) + Tailwind** — satu app untuk PWA petugas dan admin | `pnpm` |
| PWA | Serwist (service worker), Web App Manifest, IndexedDB via **Dexie** untuk antrean offline | Install ke home screen |
| Foto | `<input type="file" accept="image/*" capture="environment">` + kompres di browser (`browser-image-compression`, maks ±1600px, JPEG 0.75) | |
| Scan plat | Kamera HP → kirim frame ke API Ceklis → diteruskan ke **engine Nopol** | Lihat §9 |
| QR tiket | Generate di server (string kode), render QR di frontend (`qrcode`) | |
| Realtime admin | Polling 15 detik (v1), SSE nanti | |
| Auth | Petugas: ID/no. HP + PIN 6 digit. Admin: email + password. Session cookie httpOnly | |

### Struktur

```
ceklis/
├── apps/
│   ├── api/                  # FastAPI
│   │   ├── app/{core,models,schemas,routers,services,jobs}/
│   │   ├── alembic/
│   │   └── tests/
│   └── web/                  # Next.js
│       ├── app/
│       │   ├── (petugas)/    # PWA mobile: /, /checkin, /checkout/[id], /aktif, /riwayat, /akun, /masuk
│       │   ├── admin/        # dashboard: /admin, /admin/transaksi, /admin/insiden, /admin/lokasi, /admin/template
│       │   └── t/[code]/     # halaman tiket publik untuk pemilik (opsional v1)
│       ├── lib/{api,offline,camera}/
│       └── public/manifest.webmanifest
├── packages/design-tokens/
├── design/                   # mockup referensi (.dc.html)
├── docker-compose.yml
├── CLAUDE.md
└── PRD.md
```

---

## 3. Peran & akses

| Peran | Akses |
|---|---|
| `super_admin` | Semua klien, lokasi, template, user |
| `client_admin` | Semua lokasi milik satu klien (mis. Pakuwon Group) |
| `supervisor` | Pos yang ditugaskan; memutuskan insiden; lihat transaksi pos-nya |
| `petugas` | PWA saja; check in/out di pos yang ditugaskan |

Petugas ditugaskan ke **pos** (lobby) per shift. Petugas tidak memilih lokasi sendiri; admin yang mengatur. Satu petugas bisa punya beberapa penugasan, aktif sesuai jadwal atau dipilih supervisor.

---

## 4. Alur petugas (PWA)

### 4.1 Masuk
ID/no. HP + PIN → beranda pos aktif (mis. "Pakuwon Mall Surabaya · Lobby 2 · Shift pagi 07.00–15.00").

### 4.2 Check In — 4 langkah (design: `MCheckin.dc.html`)
1. **Data kendaraan** — tombol *Scan plat* (isi otomatis), atau ketik manual; jenis (Sedan, SUV/MPV, Hatchback, Lainnya), warna, merek/model, slot parkir, no. gantungan kunci.
2. **Foto kondisi awal** — 4 sisi wajib (Depan, Belakang, Kiri, Kanan) + foto kerusakan yang sudah ada (opsional, bisa banyak). *Wajib/opsional diatur per template, lihat §6.*
3. **Checklist** — tinggal **klik ceklis** (tercentang = baik). Item dari template lokasi:
   - **Tampak depan:** Lampu depan kanan, Lampu depan kiri, Bamper depan, Kap mesin
   - **Tampak samping:** Pintu depan kanan, Pintu belakang kanan, Pintu depan kiri, Pintu belakang kiri
   - **Tampak belakang:** Pintu bagasi, Lampu belakang kanan, Lampu belakang kiri, Bamper belakang
   - **Lainnya:** Kaca depan & belakang, Velg & ban, Interior, Aksesori kendaraan
   - Tombol **"Ceklis semua"** per grup.
   - **Bagian dalam** (barang ada di kendaraan): Kartu e-Toll, Uang, Laptop, HP, DLL (isi teks bebas).
   - **Catatan** bebas.
   - Item yang tidak diceklis = perlu dicek → wajib foto close-up + catatan (kalau template mewajibkan).
   - **Ringkasan otomatis** (format dari klien, lihat §4.5) + tombol Salin teks & Kirim WhatsApp.
4. **Tiket cek list** — kode tiket cek list (mis. `CKL-2310-0142`) + QR untuk pemilik, ringkasan, kirim tiket cek list via WhatsApp → **Selesai, simpan**.
   - **Penamaan wajib:** selalu "Tiket cek list", **jangan "tiket valet"** — supaya tidak dikira tiket pembayaran (permintaan klien). Prefix kode `CKL-`. Berlaku di UI, teks WhatsApp, dan PDF.

Saat simpan: transaksi berstatus `parked`, `checkin_at`, `checkin_by`.

### 4.3 Check Out (design: `MCheckout.dc.html`)
1. Cari via **scan QR tiket** atau plat / slot.
2. Tampil catatan & kerusakan dari check in.
3. **Foto ulang** tiap sisi, ditampilkan berdampingan dengan foto check in.
4. Konfirmasi barang di dalam masih ada.
5. Pertanyaan **"Ada kerusakan baru?"**
   - **Tidak** → status `released`, `checkout_at`, durasi tampil → selesai.
   - **Ya** → pilih bagian, foto bukti, catatan → **Kirim ke supervisor** → status `incident_pending`. Kendaraan diserahkan setelah supervisor memutuskan.
6. Teks wajib di layar: *"Sistem menyimpan perbandingan ini sebagai bahan pemeriksaan, bukan otomatis menetapkan siapa yang bertanggung jawab."*

### 4.4 Tab lain
- **Aktif** (`MAktif`) — semua kendaraan `parked` di pos; filter: lebih dari 3 jam, ada catatan, VIP; cari plat/slot; tombol Check Out.
- **Riwayat** (`MRiwayat`) — pemeriksaan oleh petugas itu; Hari ini / Kemarin / 7 hari; jumlah check in, check out, insiden.
- **Akun** (`MAkun`) — tugas & shift, kontak supervisor, **status antrean offline** ("2 data belum terkirim" + Kirim sekarang), notifikasi, kompres foto, ganti PIN, keluar.

### 4.5 Format ringkasan otomatis
Dibuat dari checklist; dipetakan seperti ini:

```
CHECKLIST VALET
Nomor polisi: B 1234 ABC
Bodi depan: Baik                      ← Bamper depan, Kap mesin
Bodi belakang: Baik                   ← Pintu bagasi, Bamper belakang
Bodi kiri: Baik                       ← Pintu depan kiri, Pintu belakang kiri
Bodi kanan: Baik                      ← Pintu depan kanan, Pintu belakang kanan
Kaca depan dan belakang: Baik         ← Kaca depan & belakang
Lampu: Baik                           ← 4 item lampu
Velg dan ban: Baik                    ← Velg & ban
Interior: Baik                        ← Interior
Aksesori kendaraan: Baik              ← Aksesori kendaraan
Barang: Kartu e-Toll, HP
Catatan: -
```

Kalau ada item sumber yang tidak diceklis: `Perlu dicek (bamper depan, kap mesin)`. Pemetaan baris ringkasan → item disimpan di template (§6), bukan hardcode, supaya klien lain bisa beda format.

"Kirim WhatsApp" v1 = buka `https://wa.me/<no>?text=<urlencoded>`; nomor pemilik opsional diisi di langkah 1.

---

## 5. Dashboard admin (design: `A*.dc.html`)

| Route | Design | Isi |
|---|---|---|
| `/admin` | `ADashboard` | Filter lokasi bertingkat (Semua → klien/lokasi → pos), KPI (masih parkir, masuk, keluar, insiden terbuka, rata-rata durasi), grafik masuk vs keluar per jam, aktivitas terbaru, tabel per lokasi/pos |
| `/admin/transaksi` | `ATransaksi` | Gabungan menu Kendaraan Masuk / Keluar / Data Kendaraan: tab Semua, Masih parkir, Selesai, Ada insiden; cari plat/jenis/warna; detail: foto masuk vs keluar per sisi, checklist masuk vs keluar (beda di-highlight), barang, petugas, durasi |
| `/admin/insiden` | `AInsiden` | Daftar insiden + status; detail: foto berdampingan dengan penanda, catatan petugas, riwayat; keputusan supervisor: **Kerusakan baru, catat** / **Tidak ada, serahkan** + catatan pemeriksaan |
| `/admin/lokasi` | `ALokasi` | Pohon Klien → Lokasi → Pos; tambah lokasi/pos; tabel pos (petugas, supervisor, masih parkir, status); petugas per lokasi (peran, pos, pemeriksaan hari ini, terakhir aktif); undang petugas |
| `/admin/template` | `AChecklist` | Template checklist: grup & item (tambah/hapus/urut), foto wajib per sisi, "wajib foto kalau tidak diceklis", barang di dalam, pemetaan ringkasan, dipakai di lokasi mana |
| `/admin/laporan` | — (belum didesain) | Rekap transaksi, durasi parkir, insiden; export CSV/PDF |
| `/admin/pengaturan` | — (belum didesain) | Hak akses, kategori checklist, konfigurasi sistem |

---

## 6. Template checklist

- Template dimiliki klien (atau global), dipasang ke lokasi; pos mewarisi template lokasi.
- **Versi**: setiap simpan = versi baru. Transaksi menyimpan `template_version_id` + **snapshot item** saat check in, supaya perubahan template tidak mengubah transaksi lama.
- Konfigurasi per template:
  - `photo_mode`: `required_4_sides` (default) | `only_when_unchecked` | `off`
  - grup → item (`label`, `kind`: `exterior` | `inside_item`, `requires_photo_if_unchecked`)
  - `summary_lines`: daftar `{label, item_ids[]}` untuk §4.5
- Template default "Standar Mobil" = isi §4.2.

---

## 7. Status & aturan

```
parked ──(check out, tidak ada kerusakan baru)──► released
   │
   └──(check out, ada perbedaan)──► incident_pending ──(supervisor: tidak ada)──► released
                                          └──(supervisor: kerusakan baru)──► incident_confirmed → released (dengan catatan)
```

- Satu plat hanya boleh punya satu transaksi `parked` per lokasi.
- Check out butuh: foto keluar sesuai `photo_mode` + jawaban kerusakan baru.
- Hanya supervisor/admin di pos itu yang bisa memutuskan insiden.
- Semua aksi dicatat di `activity_logs` (siapa, kapan, dari perangkat mana).

---

## 8. Offline (PWA)

- App shell & aset di-cache (Serwist).
- Check in/out dibuat di **IndexedDB** dulu dengan `client_id` (UUID dari HP), lalu dikirim ke API. API **idempoten** terhadap `client_id`.
- Foto disimpan sebagai Blob di IndexedDB, di-upload ke presigned URL saat online; transaksi baru "lengkap" setelah semua foto terunggah.
- Background Sync bila tersedia; fallback: coba ulang saat app dibuka / online event.
- UI menampilkan jumlah data tertunda (Akun + badge kecil di header).
- Data petugas yang belum terkirim jangan pernah hilang saat logout: tahan logout sampai antrean kosong atau minta konfirmasi.

---

## 9. Scan plat (integrasi Nopol)

- PWA ambil 1 foto dari kamera belakang → `POST /api/plates/scan` (Ceklis API) → diteruskan ke engine Nopol (`NOPOL_API_URL` + `NOPOL_RECOGNIZE_PATH`, lihat §0).
- Hasil < 0.8 confidence: tampilkan tapi minta petugas konfirmasi.
- Kalau gagal / offline: petugas ketik manual, tidak memblokir alur.
- Diputuskan (Okt 2026): engine Nopol on-prem di server klien / LAN lokasi.

---

## 10. API (ringkas)

Prefix `/api`.

| Method | Path | Fungsi |
|---|---|---|
| POST | `/auth/petugas/login` · `/auth/admin/login` · `/auth/logout` | Auth |
| GET | `/me` · `/me/assignment` | Profil + pos aktif |
| POST | `/plates/scan` | Scan plat |
| POST | `/uploads/presign` | Presigned URL foto |
| POST | `/transactions` | Check in (idempoten via `client_id`) |
| GET | `/transactions?post_id=&status=&q=` | Aktif / riwayat |
| GET | `/transactions/{id}` · `/tickets/{code}` | Detail / cari via QR |
| POST | `/transactions/{id}/checkout` | Check out (foto, cek barang, `has_new_damage`) |
| POST | `/transactions/{id}/incident` | Buat insiden (bagian, foto, catatan) |
| POST | `/incidents/{id}/decision` | Supervisor: `no_damage` / `damage_confirmed` + catatan |
| GET | `/admin/stats?scope=` · `/admin/transactions` · `/admin/incidents` | Dashboard |
| CRUD | `/admin/clients` · `/admin/sites` · `/admin/posts` · `/admin/users` · `/admin/assignments` | Lokasi & petugas |
| CRUD | `/admin/templates` (+ `/versions`) | Template checklist |
| GET | `/admin/reports/*.csv` | Laporan |

---

## 11. Model data

```sql
clients(id, name)
sites(id, client_id, name, address, template_id)
posts(id, site_id, name, active)                                   -- Lobby 1..6
users(id, name, phone unique null, email unique null, pin_hash null, password_hash null, role, client_id null, active)
assignments(id, user_id, post_id, role_on_post, shift_start, shift_end, valid_from, valid_to)
checklist_templates(id, client_id null, name)
template_versions(id, template_id, version, config jsonb, created_by, created_at)  -- grup, item, photo_mode, summary_lines
vehicles(id, plate_normalized unique, plate_display, make_model, color, type)      -- opsional, untuk pencarian
transactions(id, client_id_uuid unique, post_id, site_id, template_version_id, plate, plate_normalized,
             vehicle_type, color, make_model, slot, key_tag, owner_phone null, ticket_code unique,
             status, checkin_at, checkin_by, checkout_at null, checkout_by null, notes, summary_text)
transaction_checks(transaction_id, phase in ('in','out'), item_id, label_snapshot, group_snapshot, checked bool)
transaction_inside_items(transaction_id, phase, label, present bool, extra_text null)
photos(id, transaction_id, phase, side in ('depan','belakang','kiri','kanan','detail'), object_key, taken_at, uploaded_at)
incidents(id, transaction_id, code unique, parts text[], note, status, decided_by null, decision null, decision_note null, decided_at null)
activity_logs(id, actor_id, action, entity, entity_id, device, created_at)
```

Index: `transactions(post_id, status)`, `transactions(plate_normalized)`, `transactions(site_id, checkin_at desc)`.
Partial unique: satu `parked` per (`site_id`, `plate_normalized`).

---

## 12. Design

Mockup di `design/` (format canvas `.dc.html`; baca markup + style sebagai acuan, jangan disalin mentah).

| File | Layar |
|---|---|
| `Main.dc.html` | PWA · Login petugas |
| `MHome.dc.html` | PWA · Beranda |
| `MCheckin.dc.html` | PWA · Check In 4 langkah (checklist + ringkasan otomatis di langkah 3) |
| `MCheckout.dc.html` | PWA · Check Out, perbandingan, insiden |
| `MAktif.dc.html` · `MRiwayat.dc.html` · `MAkun.dc.html` | PWA · tab Aktif, Riwayat, Akun |
| `ADashboard.dc.html` · `ATransaksi.dc.html` · `AInsiden.dc.html` · `ALokasi.dc.html` · `AChecklist.dc.html` | Admin |

Token (sama dengan Nopol): ink `#0E100F`, paper `#F2F2EE`, surface `#FFFFFF`, line `#DCDDD6`, muted `#50554F`, accent kuning `#F5C518` (teks di atasnya selalu ink), danger `#C2410C` / `#A3440B` di atas `#FBEDE6`, success `#1E6B3E` di atas `#E5F3EA`, warning `#6B5300` di atas `#FDF3C4`. Font: Space Grotesk (judul), IBM Plex Sans (teks), JetBrains Mono (plat, kode). Strip hazard kuning-hitam di login. Plat ditampilkan seperti plat asli (latar `#F4F4F0`, border hitam 2px, mono bold).

Aturan mobile: target sentuh ≥ 44px (tombol utama 56px), font input ≥ 16px (hindari zoom iOS), kontras ≥ 4.5:1, dipakai satu tangan, terbaca di bawah sinar matahari (latar terang di konten).

---

## 13. Milestone

| # | Milestone | Selesai kalau |
|---|---|---|
| M1 | Skeleton monorepo + auth | `docker compose up`; login petugas (PIN) & admin |
| M2 | Lokasi, pos, petugas, penugasan | Admin bisa bikin Pakuwon Mall Surabaya + Lobby 1–6 dan menugaskan petugas |
| M3 | Template checklist v1 | Template "Standar Mobil" ter-seed; editor admin; versi tersimpan |
| M4 | Check In PWA | 4 langkah jalan di HP, foto ter-upload, tiket + ringkasan + wa.me |
| M5 | Check Out + insiden | Perbandingan foto, keputusan supervisor, status benar |
| M6 | Offline | Mode pesawat: check in tersimpan, terkirim otomatis saat online, tidak dobel |
| M7 | Dashboard admin | KPI, grafik, transaksi, insiden sesuai design |
| M8 | Scan plat Nopol | Scan mengisi plat; fallback manual |
| M9 | Laporan + production | CSV/PDF, PWA installable (Lighthouse PWA lolos), backup DB |

Test wajib: idempotensi `client_id`, state machine transaksi, snapshot template, generator ringkasan §4.5, izin per peran (petugas tidak bisa lihat pos lain).

---

## 14. Keputusan terbuka

- [ ] Foto check in: wajib 4 sisi (default) atau ikut `photo_mode` per klien — konfirmasi ke klien.
- [ ] Engine Nopol untuk scan plat: cloud khusus Ceklis atau server klien.
- [ ] Nomor WhatsApp pemilik diminta saat check in atau tidak.
- [ ] Halaman tiket publik `/t/{code}` untuk pemilik (lihat status, minta kendaraan) — v1 atau v2.
- [ ] Retensi foto (mis. 90 hari) dan siapa yang boleh unduh.
- [ ] Model harga Ceklis (per pos / per lokasi / per transaksi).

---

## 15. Environment variables

```
DATABASE_URL=
REDIS_URL=
SESSION_SECRET=
APP_BASE_URL=https://ceklis.nopol-lpr.com
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=
NOPOL_API_URL=http://<engine-lokasi>:8001
NOPOL_RECOGNIZE_PATH=/recognize
NOPOL_API_TOKEN=
NOPOL_EMAIL=
NOPOL_PASSWORD=
PHOTO_MAX_PX=1600
PHOTO_RETENTION_DAYS=90
NEXT_PUBLIC_API_BASE_URL=https://ceklis.nopol-lpr.com/api
```
