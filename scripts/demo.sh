#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3312}"
BASE="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/prove-it-demo-$$.log"
DEMO_DB="${TMPDIR:-/tmp}/prove-it-demo-$$.db"

setsid env DEV_MODE=true REFEREE_MOCK=true PORT="$PORT" DATABASE_PATH="$DEMO_DB" npm run dev >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  rm -f "$LOG_FILE" "$DEMO_DB" "$DEMO_DB-wal" "$DEMO_DB-shm"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "$BASE/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$BASE/healthz" >/dev/null

state() { curl -fsS "$BASE/api/state"; printf '\n'; }
post() { curl -fsS -H 'content-type: application/json' -d "$2" "$BASE$1" >/dev/null; state; }

echo 'Demo: dare → two passing ticks → PASS'
post /api/dev/dare '{"viewer":"demo_one","text":"Touch your nose"}'
post /api/dev/tick '{"progress":1,"confidence":0.95,"done":true,"evidence":"First clear frame"}'
post /api/dev/tick '{"progress":1,"confidence":0.95,"done":true,"evidence":"Second clear frame"}'

echo 'Demo: dare → deadline FAIL → 3 appeals → poll overrule → FINAL_PASS'
post /api/dev/dare '{"viewer":"demo_two","text":"Do a backflip"}'
post /api/dev/tick '{"progress":0.2,"confidence":0.2,"done":false,"evidence":"Not completed before deadline","deadline":true}'
post /api/dev/appeal '{"viewer":"appeal_one"}'
post /api/dev/appeal '{"viewer":"appeal_two"}'
post /api/dev/appeal '{"viewer":"appeal_three"}'
post /api/dev/poll '{"overrule":true}'
