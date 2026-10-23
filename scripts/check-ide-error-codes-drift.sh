#!/bin/bash
# Anti-drift (IDE half): vendored docs/ide-error-codes.json (+ schema)
# vs samsong8610/developtools_hdc lite/docs/ide-error-codes.json @ pinned ref.
#
# Usage:
#   ./scripts/check-ide-error-codes-drift.sh
#   HDC_ERROR_CODES_REF=5327930b ./scripts/check-ide-error-codes-drift.sh
#   HDC_ERROR_CODES_FILE=/path/to/ide-error-codes.json ./scripts/check-ide-error-codes-drift.sh
#   SKIP_UPSTREAM_ERROR_CODES=1 ./scripts/check-ide-error-codes-drift.sh
#
# Exit 0 = no drift. Prints RESULT=0|1.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
JSON=${HDC_ERROR_CODES_FILE:-$ROOT/docs/ide-error-codes.json}
SCHEMA=$ROOT/docs/ide-error-codes.schema.json
HDC_REPO=${HDC_REPO:-samsong8610/developtools_hdc}
HDC_REF=${HDC_ERROR_CODES_REF:-5327930b}
UPSTREAM_PATH=lite/docs/ide-error-codes.json
R=0
pass(){ echo "[PASS] $*"; }
fail(){ echo "[FAIL] $*"; R=1; }
warn(){ echo "[WARN] $*"; }

echo "==== check-ide-error-codes-drift (IDE) $(date '+%Y-%m-%d %H:%M:%S %z') ===="
echo "json=$JSON"
echo "schema=$SCHEMA"
echo "NOTE: vendored ide-error-codes from developtools_hdc @ 5327930b version 1.0.0 (see README § IDE contract)"

[ -f "$JSON" ] || { echo "missing docs/ide-error-codes.json"; exit 2; }
[ -f "$SCHEMA" ] || { echo "missing docs/ide-error-codes.schema.json"; exit 2; }

if ! bash "$HERE/validate-ide-error-codes.sh" "$JSON" "$SCHEMA"; then
  fail "local JSON vs schema"
else
  pass "local JSON vs schema"
fi

python3 - "$JSON" << 'PY'
import json, re, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
v = str(doc.get("version", ""))
if not re.match(r"^1\.\d+\.\d+$", v):
    print(f"[FAIL] version must be 1.x semver (pinned 1.0.0); got {v!r}")
    sys.exit(1)
if v != "1.0.0":
    print(f"[WARN] vendored version is {v} (README pins 1.0.0 @ 5327930b)")
print(f"[PASS] version={v} (1.x compatible)")
sys.exit(0)
PY
V=$?
[ "$V" = 0 ] && pass "version policy (1.x)" || { fail "version policy"; R=1; }

if [ "${SKIP_UPSTREAM_ERROR_CODES:-0}" = 1 ]; then
  warn "SKIP_UPSTREAM_ERROR_CODES=1 — skip hdc repo JSON diff (local schema check still ran)"
else
  UP_TMP=$(mktemp /tmp/hdc-error-codes-XXXX.json)
  fetched=0
  if [ -n "${HDC_ERROR_CODES_FILE:-}" ] && [ "$HDC_ERROR_CODES_FILE" != "$JSON" ] && [ -f "$HDC_ERROR_CODES_FILE" ]; then
    cp -a "$HDC_ERROR_CODES_FILE" "$UP_TMP"
    fetched=1
    echo "using HDC_ERROR_CODES_FILE=$HDC_ERROR_CODES_FILE for upstream compare"
  elif command -v gh >/dev/null 2>&1; then
    for ref in "$HDC_REF" 5327930b main ohjs/6.1-lite; do
      if gh api "repos/$HDC_REPO/contents/$UPSTREAM_PATH?ref=$ref" \
          --jq '.content' 2>/dev/null | base64 -d > "$UP_TMP" 2>/dev/null \
          && python3 -c "import json; json.load(open('$UP_TMP'))" 2>/dev/null; then
        echo "fetched $HDC_REPO@$ref:$UPSTREAM_PATH"
        fetched=1
        HDC_REF=$ref
        break
      fi
    done
  fi
  if [ "$fetched" != 1 ]; then
    RAW="https://raw.githubusercontent.com/$HDC_REPO/$HDC_REF/$UPSTREAM_PATH"
    for ref in "$HDC_REF" 5327930b; do
      if curl -fsSL "https://raw.githubusercontent.com/$HDC_REPO/$ref/$UPSTREAM_PATH" -o "$UP_TMP" 2>/dev/null \
          && python3 -c "import json; json.load(open('$UP_TMP'))" 2>/dev/null; then
        echo "fetched raw $HDC_REPO@$ref:$UPSTREAM_PATH"
        fetched=1
        HDC_REF=$ref
        break
      fi
    done
  fi
  if [ "$fetched" != 1 ]; then
    for p in /workspace/developtools_hdc /tmp/developtools_hdc; do
      if [ -f "$p/$UPSTREAM_PATH" ]; then
        cp -a "$p/$UPSTREAM_PATH" "$UP_TMP"
        echo "using local clone $p/$UPSTREAM_PATH"
        fetched=1
        break
      fi
    done
  fi
  if [ "$fetched" != 1 ]; then
    warn "could not fetch hdc ide-error-codes.json — skip upstream diff (local validation still counts)"
  else
    python3 - "$JSON" "$UP_TMP" << 'PY'
import hashlib, json, sys

def file_sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

def canon_sha(path):
    data = json.load(open(path, encoding="utf-8"))
    blob = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()

local, remote = sys.argv[1], sys.argv[2]
ls, rs = file_sha(local), file_sha(remote)
if ls == rs:
    print(f"[PASS] vendored JSON byte-identical to hdc upstream (sha256={ls[:12]}…)")
    sys.exit(0)
lc, rc = canon_sha(local), canon_sha(remote)
if lc == rc:
    print("[PASS] vendored JSON canonical content matches hdc upstream (whitespace-only diff)")
    sys.exit(0)
print("[FAIL] vendored ide-error-codes.json drift vs hdc upstream")
print(f"  local sha256:    {ls}")
print(f"  upstream sha256: {rs}")
sys.exit(1)
PY
    B=$?
    [ "$B" = 0 ] && pass "vendored ↔ hdc upstream JSON (@$HDC_REF)" || fail "vendored ↔ hdc upstream JSON (@$HDC_REF)"
  fi
  rm -f "$UP_TMP"
fi

echo "Hdc-side validator: developtools_hdc lite/ci/validate-ide-error-codes.sh"
echo "RESULT=$R"
exit $R
