#!/bin/bash
# Runs the end-to-end suites against a throwaway data folder.
#   scripts/e2e.sh              all suites
#   scripts/e2e.sh safety       just one (core, safety, undo, plan)
# Needs Codex signed in somewhere; by default it reuses ~/.codex
# (override with TERMLESS_CODEX_HOME). Screenshots go to $OUT.
# Every conversation is deleted at the end, together with its Codex thread;
# any thread a suite deliberately orphaned is deleted afterwards as well.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-$(mktemp -d)/termless-e2e}"
mkdir -p "$OUT"
rm -f "$OUT/threads.json"
npm run build >/dev/null
export TERMLESS_CODEX_HOME="${TERMLESS_CODEX_HOME:-$HOME/.codex}"
suites=("$@")
[ ${#suites[@]} -eq 0 ] && suites=(core safety undo plan)
status=0
for suite in "${suites[@]}"; do
  echo "=== $suite"
  # Each suite starts from an empty data folder.
  rm -rf "$OUT/data-$suite"
  node "scripts/e2e/$suite.mjs" "$OUT" "$OUT/data-$suite" || status=1
done
sleep 2
[ -f "$OUT/threads.json" ] && node scripts/delete-threads.mjs "$OUT/threads.json"
echo "Screenshots: $OUT"
exit $status
