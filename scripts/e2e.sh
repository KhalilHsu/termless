#!/bin/bash
# Runs the Assistant end-to-end test against a throwaway data folder.
# Needs Codex signed in somewhere; by default it reuses ~/.codex
# (override with TERMLESS_CODEX_HOME). Screenshots go to $OUT.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-$(mktemp -d)/termless-e2e}"
DATA="$OUT/data"
mkdir -p "$OUT"
npm run build >/dev/null
TERMLESS_CODEX_HOME="${TERMLESS_CODEX_HOME:-$HOME/.codex}" TERMLESS_USER_DATA="$DATA" \
  ./node_modules/.bin/electron . --remote-debugging-port=9333 >"$OUT/electron.log" 2>&1 &
APP=$!
trap 'kill $APP 2>/dev/null || true' EXIT
node scripts/e2e.mjs 9333 "$OUT" "$DATA"
echo "Screenshots: $OUT"
