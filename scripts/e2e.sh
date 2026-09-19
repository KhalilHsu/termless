#!/bin/bash
# Runs the Assistant + History end-to-end test against a throwaway data folder.
# Needs Codex signed in somewhere; by default it reuses ~/.codex
# (override with TERMLESS_CODEX_HOME). Screenshots go to $OUT.
# Every conversation is deleted at the end, together with its Codex thread;
# any thread the test deliberately orphaned is deleted afterwards as well.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-$(mktemp -d)/termless-e2e}"
DATA="$OUT/data"
mkdir -p "$OUT"
npm run build >/dev/null
export TERMLESS_CODEX_HOME="${TERMLESS_CODEX_HOME:-$HOME/.codex}"
status=0
node scripts/e2e.mjs "$OUT" "$DATA" || status=$?
sleep 2
[ -f "$OUT/threads.json" ] && node scripts/delete-threads.mjs "$OUT/threads.json"
echo "Screenshots: $OUT"
exit $status
