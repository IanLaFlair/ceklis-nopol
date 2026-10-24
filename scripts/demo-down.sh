#!/bin/sh
# Matikan semua proses demo dari scripts/demo-up.sh (container Docker dibiarkan).
pkill -f "ceklis-loop-" 2>/dev/null
pkill -f "uvicorn app.main:app" 2>/dev/null
kill $(lsof -tiTCP:${CEKLIS_PORT:-3001} -sTCP:LISTEN) 2>/dev/null
pkill -f "ngrok http ${CEKLIS_PORT:-3001}" 2>/dev/null
echo "Demo Ceklis dimatikan."
