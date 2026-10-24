# Deploy Ceklis ke VPS Nopol

Pola sama dengan nopol-lpr: repo di `~/app/ceklis-nopol`, `docker-compose.prod.yml` + `.env.production`,
container hanya membuka port ke `127.0.0.1`, HTTPS lewat container `caddy` (network host).

| Hostname | Ke | Isi |
|---|---|---|
| `ceklis.nopol-lpr.com` | `localhost:3030` | PWA petugas + admin (+ `/api` diteruskan ke API di dalam compose) |
| `ceklis-files.nopol-lpr.com` | `localhost:9030` | Storage foto (upload langsung dari HP) |

## 1. DNS (panel Rumahweb, domain nopol-lpr.com)

Tambah 2 record **A** ke IP VPS `15.235.207.188`: `ceklis` dan `ceklis-files`.
Cek: `dig +short ceklis.nopol-lpr.com` → harus keluar IP itu.

## 2. Pertama kali di VPS

```bash
ss -tlnp | grep -E ':(3030|9030)\b'          # harus kosong; kalau terpakai ganti CEKLIS_*_PORT + Caddyfile
docker inspect caddy --format '{{.HostConfig.NetworkMode}}'   # harus: host

cd ~/app && git clone https://github.com/IanLaFlair/ceklis-nopol.git && cd ceklis-nopol
cp deploy/env.production.example .env.production && nano .env.production   # isi semua <...>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs api | grep "super admin"
```

## 3. Caddy

Tempel isi `deploy/Caddyfile.ceklis` di **paling bawah** `~/infra/caddy/Caddyfile`, lalu:

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile     # kalau tidak berubah: docker restart caddy
```

Cek: `curl -sI https://ceklis.nopol-lpr.com/masuk` → `200`, `curl -s https://ceklis.nopol-lpr.com/api/health` → `{"ok":true}`.

## 4. Data awal

- Login `https://ceklis.nopol-lpr.com/admin/login` pakai `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, lalu **ganti password** (Pengaturan).
- Buat klien → lokasi → pos, undang petugas (PIN tampil sekali), pasang template "Standar Mobil".
- Data demo (`app.seed --demo`) **jangan** dijalankan di produksi.

## 5. Update

```bash
cd ~/app/ceklis-nopol && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrasi database jalan otomatis saat container `api` start.

## 6. Backup

`deploy/backup.sh` → `~/backups/ceklis` (pg_dump + arsip foto, simpan 14 hari). Pasang cron:

```
15 2 * * * ~/app/ceklis-nopol/deploy/backup.sh >> ~/backups/ceklis/backup.log 2>&1
```

Restore DB: `docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db pg_restore -U ceklis -d ceklis --clean < ~/backups/ceklis/db-XXXX.dump`
