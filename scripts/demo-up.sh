#!/bin/sh
# Nyalakan Ceklis untuk demo: Docker (DB, Redis, storage) + API + web produksi (port 3001) + ngrok.
# Tiap proses jalan di latar belakang dan otomatis restart kalau berhenti. Log di .demo/.
# Matikan: scripts/demo-down.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/.demo"
PORT="${CEKLIS_PORT:-3001}"
mkdir -p "$LOG"

if ! docker info >/dev/null 2>&1; then
  echo "Menyalakan Docker…"
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 3; done
fi
(cd "$ROOT" && docker compose up -d db redis storage >/dev/null)
until docker compose -f "$ROOT/docker-compose.yml" ps db --format '{{.Status}}' | grep -q healthy; do sleep 2; done
(cd "$ROOT/apps/api" && uv run alembic upgrade head >/dev/null 2>&1)

if [ ! -f "$ROOT/apps/web/.next-prod/BUILD_ID" ]; then
  echo "Build web produksi (sekali, ±1 menit)…"
  (cd "$ROOT/apps/web" && NEXT_DIST_DIR=.next-prod pnpm exec next build >"$LOG/build.log" 2>&1)
fi

loop() { # nama, direktori, perintah…
  name=$1; dir=$2; shift 2
  pkill -f "ceklis-loop-$name" 2>/dev/null || true
  nohup sh -c "exec -a ceklis-loop-$name sh -c 'cd \"$dir\"; while true; do $*; echo \"\$(date) $name berhenti, restart\" >> \"$LOG/restarts.log\"; sleep 2; done'" \
    >>"$LOG/$name.log" 2>&1 &
}

pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "next start -p $PORT" 2>/dev/null || true
pkill -f "ngrok http $PORT" 2>/dev/null || true
sleep 1
loop api "$ROOT/apps/api" "./.venv/bin/uvicorn app.main:app --port 8000"
loop web "$ROOT/apps/web" "NEXT_DIST_DIR=.next-prod ./node_modules/.bin/next start -p $PORT"
loop ngrok "$ROOT" "ngrok http $PORT --log=stdout --log-format=logfmt"

until curl -s -m 2 localhost:8000/api/health | grep -q ok; do sleep 1; done
until curl -s -m 2 -o /dev/null -w '%{http_code}' "localhost:$PORT/masuk" | grep -q 200; do sleep 1; done
until URL=$(curl -s -m 2 localhost:4040/api/tunnels | python3 -c 'import sys,json;t=json.load(sys.stdin)["tunnels"];print(t[0]["public_url"])' 2>/dev/null); do sleep 1; done
echo "Ceklis siap:"
echo "  lokal : http://localhost:$PORT/masuk"
echo "  publik: $URL/masuk   (admin: $URL/admin/login)"
