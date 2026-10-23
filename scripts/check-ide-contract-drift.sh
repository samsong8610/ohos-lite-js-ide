#!/bin/bash
# Anti-drift (IDE half): docs/IDE-CONTRACT.md + vendored docs/ide-contract.manifest.json
# vs samsong8610/developtools_hdc lite/docs/ide-contract.manifest.json.
# Hdc half: developtools_hdc lite/tools/board/check-ide-contract-drift.sh
#
# Usage:
#   ./scripts/check-ide-contract-drift.sh
#   HDC_MANIFEST_REF=fd84af8 ./scripts/check-ide-contract-drift.sh
#   HDC_MANIFEST_FILE=/path/to/ide-contract.manifest.json ./scripts/check-ide-contract-drift.sh
#   SKIP_UPSTREAM_MANIFEST=1 ./scripts/check-ide-contract-drift.sh
#
# Exit 0 = no drift on required keys. Prints RESULT=0|1.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
MANIFEST=${HDC_MANIFEST_FILE:-$ROOT/docs/ide-contract.manifest.json}
LOCAL_MD=${IDE_CONTRACT_MD:-$ROOT/docs/IDE-CONTRACT.md}
HDC_REPO=${HDC_REPO:-samsong8610/developtools_hdc}
HDC_REF=${HDC_MANIFEST_REF:-main}
R=0
pass(){ echo "[PASS] $*"; }
fail(){ echo "[FAIL] $*"; R=1; }
warn(){ echo "[WARN] $*"; }

echo "==== check-ide-contract-drift (IDE) $(date '+%Y-%m-%d %H:%M:%S %z') ===="
echo "manifest=$MANIFEST"
echo "local_md=$LOCAL_MD"
echo "NOTE: vendored manifest from developtools_hdc @ fd84af8 (see README § IDE contract)"

[ -f "$MANIFEST" ] || { echo "missing manifest"; exit 2; }
[ -f "$LOCAL_MD" ] || { echo "missing docs/IDE-CONTRACT.md"; exit 2; }

# --- A) manifest keys present in local IDE-CONTRACT.md (same as hdc script section A) ---
python3 - "$MANIFEST" "$LOCAL_MD" << 'PY'
import json, sys
man, md_path = sys.argv[1], sys.argv[2]
m = json.load(open(man))
text = open(md_path, encoding="utf-8").read()
R = 0

def need(label, needle):
    global R
    if needle in text or str(needle) in text:
        print(f"[PASS] local MD has {label}: {needle}")
    else:
        print(f"[FAIL] local MD missing {label}: {needle}")
        R = 1

ports = m["ports"]
need("device_hdcd_tcp", str(ports["device_hdcd_tcp"]))
need("host_hdc_server", str(ports["host_hdc_server"]))
need("jsdebug_host_bridge", str(ports["jsdebug_host_bridge"]))
need("OHOS_HDC_SERVER_PORT", ports["host_hdc_server_env"])
need("HOST_PORT", ports.get("jsdebug_host_bridge_env", "HOST_PORT"))
paths = m["paths"]
need("ide_ace_dir", "/data/ohjs")
need("hap_push", "/tmp/ohjs/app.hap")
need("debug_marker", "debug.<bundle>")
need("tmp_dir", "/tmp/ohjs")
need("hilog_cap", "hilog.cap")
need("hilogcat_pid", "hilogcat.pid")
shell = m.get("shell", {})
need("exit_code_marker", shell.get("exit_code_marker", "__RC=$?"))
for item in m.get("forbidden", []):
    if "18710" in item or "g2" in item.lower():
        need("forbidden jsdebug on G2", "18710")
        break
sys.exit(R)
PY
A=$?
[ "$A" = 0 ] && pass "manifest ↔ local IDE-CONTRACT.md (section A)" || fail "manifest ↔ local IDE-CONTRACT.md (section A)"

# --- C) required strings (hdc script section C, local copy is authoritative IDE MD) ---
python3 - "$MANIFEST" "$LOCAL_MD" << 'PY'
import json, sys
m = json.load(open(sys.argv[1]))
text = open(sys.argv[2], encoding="utf-8").read()
R = 0
def need(label, needle):
    global R
    if str(needle) in text:
        print(f"[PASS] IDE MD has {label}: {needle}")
    else:
        print(f"[FAIL] IDE MD missing {label}: {needle}")
        R = 1
ports = m["ports"]
need("device_hdcd_tcp", ports["device_hdcd_tcp"])
need("host_hdc_server", ports["host_hdc_server"])
need("jsdebug_host_bridge", ports["jsdebug_host_bridge"])
need("path /data/ohjs", "/data/ohjs")
need("path /tmp/ohjs", "/tmp/ohjs")
need("marker debug.<bundle>", "debug.<bundle>")
need("hap app.hap", "app.hap")
need("shell __RC", "__RC")
sys.exit(R)
PY
C=$?
[ "$C" = 0 ] && pass "manifest ↔ IDE-CONTRACT.md (section C)" || fail "manifest ↔ IDE-CONTRACT.md (section C)"

# --- B) optional: upstream hdc manifest vs vendored copy ---
if [ "${SKIP_UPSTREAM_MANIFEST:-0}" = 1 ]; then
  warn "SKIP_UPSTREAM_MANIFEST=1 — skip hdc repo manifest diff"
else
  UP_TMP=$(mktemp /tmp/hdc-manifest-XXXX.json)
  fetched=0
  if [ -n "${HDC_MANIFEST_FILE:-}" ] && [ "$HDC_MANIFEST_FILE" != "$MANIFEST" ] && [ -f "$HDC_MANIFEST_FILE" ]; then
    cp -a "$HDC_MANIFEST_FILE" "$UP_TMP"
    fetched=1
    echo "using HDC_MANIFEST_FILE=$HDC_MANIFEST_FILE for upstream compare"
  elif command -v gh >/dev/null 2>&1; then
    for ref in "$HDC_REF" fd84af8 main ohjs/6.1-lite; do
      if gh api "repos/$HDC_REPO/contents/lite/docs/ide-contract.manifest.json?ref=$ref" \
          --jq '.content' 2>/dev/null | base64 -d > "$UP_TMP" 2>/dev/null \
          && python3 -c "import json; json.load(open('$UP_TMP'))" 2>/dev/null; then
        echo "fetched $HDC_REPO@$ref:lite/docs/ide-contract.manifest.json"
        fetched=1
        HDC_REF=$ref
        break
      fi
    done
  fi
  if [ "$fetched" != 1 ]; then
    for p in /workspace/developtools_hdc /tmp/developtools_hdc; do
      if [ -f "$p/lite/docs/ide-contract.manifest.json" ]; then
        cp -a "$p/lite/docs/ide-contract.manifest.json" "$UP_TMP"
        echo "using local clone $p/lite/docs/ide-contract.manifest.json"
        fetched=1
        break
      fi
    done
  fi
  if [ "$fetched" != 1 ]; then
    warn "could not fetch hdc manifest — skip upstream diff (local A/C still counts)"
  else
    python3 - "$MANIFEST" "$UP_TMP" << 'PY'
import json, sys

def contract_slice(d):
    return {
        "ports": d["ports"],
        "paths": d["paths"],
        "markers": d["markers"],
        "shell": d["shell"],
        "forbidden": d["forbidden"],
    }

local = contract_slice(json.load(open(sys.argv[1])))
remote = contract_slice(json.load(open(sys.argv[2])))
R = 0
if local == remote:
    print("[PASS] vendored manifest matches hdc lite/docs/ide-contract.manifest.json (ports/paths/markers/shell/forbidden)")
else:
    print("[FAIL] vendored manifest drift vs hdc upstream")
    for key in ("ports", "paths", "markers", "shell", "forbidden"):
        if local.get(key) != remote.get(key):
            print(f"  diff {key}:")
            print(f"    vendored: {local.get(key)}")
            print(f"    upstream: {remote.get(key)}")
    R = 1
sys.exit(R)
PY
    B=$?
    [ "$B" = 0 ] && pass "vendored ↔ hdc upstream manifest" || fail "vendored ↔ hdc upstream manifest (@$HDC_REF)"
  fi
  rm -f "$UP_TMP"
fi

echo "Hdc-side checker: developtools_hdc lite/tools/board/check-ide-contract-drift.sh"
echo "RESULT=$R"
exit $R
