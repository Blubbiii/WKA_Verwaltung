#!/usr/bin/env bash
#
# Lokalen Produktions-Server für die Ablauf-Tests neu starten.
#
# ## Warum es dieses Skript gibt
#
# Zweimal hintereinander habe ich `next start` aufgerufen, ohne den vorherigen
# Server zu beenden. Der neue scheiterte still mit `EADDRINUSE`, der alte lief
# weiter — und die Tests liefen gegen den ALTEN Stand. Beim ersten Mal hätte
# ich fast einen „schnelleren Lauf" gemeldet, der keiner war; beim zweiten Mal
# habe ich einen Fix als wirkungslos eingestuft, der schlicht nicht lief.
#
# Ein Fehlstart, der wie ein Erfolg aussieht, kostet mehr Zeit als der ganze
# Neustart. Deshalb: erst den Port räumen, dann bauen, dann starten, und am
# Ende prüfen, dass wirklich der neue Stand antwortet.
#
# ## Aufruf
#
#   bash scripts/local-e2e-server.sh          # bauen und starten
#   bash scripts/local-e2e-server.sh --no-build   # nur neu starten
#
# Danach:
#   E2E_BASE_URL=http://localhost:3050 npx playwright test e2e/journeys --project=chromium

set -euo pipefail

PORT=3050
LOG="${TMPDIR:-/tmp}/wpm-local-server.log"

echo "→ Port $PORT räumen"
# Windows und Unix getrennt behandelt — dieselbe Aufgabe, andere Werkzeuge.
if command -v powershell.exe > /dev/null 2>&1; then
  powershell.exe -NoProfile -Command "
    Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
  " > /dev/null 2>&1 || true
else
  fuser -k "${PORT}/tcp" > /dev/null 2>&1 || true
fi
sleep 2

if [ "${1:-}" != "--no-build" ]; then
  echo "→ bauen"
  npm run build 2>&1 | grep -E "Compiled|Failed|error" || true
fi

echo "→ starten"
nohup npx next start -p "$PORT" > "$LOG" 2>&1 &
sleep 8

# Der eigentliche Zweck: nachsehen, ob der Start GELUNGEN ist. Ohne diese
# Prüfung meldet ein fehlgeschlagener Start nichts und der alte Server
# beantwortet weiter jede Anfrage.
if grep -q "EADDRINUSE" "$LOG"; then
  echo "✗ Port $PORT ist immer noch belegt — der alte Server läuft weiter."
  echo "  Protokoll: $LOG"
  exit 1
fi

for _ in $(seq 1 20); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health/live")" = "200" ]; then
    echo "✓ bereit auf http://localhost:$PORT"
    echo "  Protokoll: $LOG"
    exit 0
  fi
  sleep 2
done

echo "✗ Server antwortet nicht. Protokoll: $LOG"
tail -20 "$LOG"
exit 1
