#!/usr/bin/env bash
# G4 host gate smoke: mock-hdc + in-process Jerry mock (no USB, no board).
# Prints RESULT=0 on PASS, RESULT=1 on FAIL; exit code matches RESULT.
#
# Environment:
#   G4_MOCK_TCONN       mock `hdc tconn` endpoint (default 127.0.0.1:8720)
#   G4_MOCK_LOCAL_PORT  host fport local side (default 19041)
#   OHJS_FIXTURE_ROOT   oh-project fixture root (default extension test fixture)
#   SKIP_BUILD=1        skip `pnpm run ci:build` (vitest resolves TS via aliases)
#
# Usage (from repo root):
#   pnpm run smoke:g4-mock
#   bash scripts/smoke-g4-mock.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RESULT=1

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "[g4-smoke] building monorepo (SKIP_BUILD=1 to skip)…"
  pnpm run ci:build
fi

echo "[g4-smoke] mock-hdc → launchJerryOnDevice → breakpoint / pause / continue (Jerry v9 mock)"
if pnpm exec vitest run packages/debug-adapter/test/e2e/g4-host-mock.test.ts; then
  RESULT=0
fi

echo "RESULT=${RESULT}"
exit "${RESULT}"
