#!/bin/sh
# Matikan semua proses demo dari scripts/demo-up.sh (container Docker dibiarkan).
pkill -f "ceklis-loop-" 2>/dev/null
pkill -f "uvicorn app.main:app" 2>/dev/null
pkill -f "next start -p ${CEKLIS_PORT:-3001}" 2>/dev/null
pkill -f "ngrok http ${CEKLIS_PORT:-3001}" 2>/dev/null
echo "Demo Ceklis dimatikan."
