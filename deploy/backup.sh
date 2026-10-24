#!/bin/sh
# Backup harian Ceklis: database (pg_dump) + foto (storage). Simpan 14 hari.
# Cron (crontab -e):  15 2 * * * ~/app/ceklis-nopol/deploy/backup.sh >> ~/backups/ceklis/backup.log 2>&1
set -e
cd "$(dirname "$0")/.."
DEST="$HOME/backups/ceklis"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p "$DEST"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_dump -U ceklis -Fc ceklis > "$DEST/db-$STAMP.dump"
docker run --rm -v ceklis_s3data:/data:ro -v "$DEST":/out alpine \
  tar czf "/out/foto-$STAMP.tar.gz" -C /data .
find "$DEST" -name 'db-*.dump' -mtime +14 -delete
find "$DEST" -name 'foto-*.tar.gz' -mtime +14 -delete
echo "$(date) backup ok: db-$STAMP.dump foto-$STAMP.tar.gz"
