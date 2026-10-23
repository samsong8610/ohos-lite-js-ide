#!/usr/bin/env bash
# G3 host gate smoke: mock-hdc stand-in for hdc (no USB, no board).
# Prints RESULT=0 on PASS, RESULT=1 on FAIL; exit code matches RESULT.
#
# Environment:
#   G3_MOCK_TCONN       mock `hdc tconn` endpoint (default 127.0.0.1:8710)
#   G3_MOCK_HILOG_LINE  expected hilog line from mock device capture
#   OHJS_FIXTURE_ROOT   oh-project fixture root (default extension test fixture)
#   SKIP_BUILD=1        skip `pnpm run ci:build` (vitest resolves TS via aliases)
#
# Usage (from repo root):
#   pnpm run smoke:g3-mock
#   bash scripts/smoke-g3-mock.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RESULT=1

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "[g3-smoke] building monorepo (SKIP_BUILD=1 to skip)…"
  pnpm run ci:build
fi

echo "[g3-smoke] mock-hdc: build → tconn → deploy / install / start → hilog parse"
if pnpm exec vitest run packages/transport-hdc/test/e2e/g3-host-mock.test.ts; then
  RESULT=0
fi

echo "RESULT=${RESULT}"
exit "${RESULT}"
