#!/bin/bash
# Validate docs/ide-error-codes.json against docs/ide-error-codes.schema.json (required keys).
# Adapted from developtools_hdc lite/ci/validate-ide-error-codes.sh @ 5327930b. Exit 0 = OK.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
DOC=${1:-$ROOT/docs/ide-error-codes.json}
SCHEMA=${2:-$ROOT/docs/ide-error-codes.schema.json}
python3 - "$DOC" "$SCHEMA" << 'PY'
import json, sys, re
doc_path, schema_path = sys.argv[1], sys.argv[2]
doc = json.load(open(doc_path, encoding="utf-8"))
schema = json.load(open(schema_path, encoding="utf-8"))
errs = []

def need(obj, key, path):
    if key not in obj:
        errs.append(f"missing {path}.{key}" if path else f"missing {key}")
        return False
    return True

for k in ("version", "protocol", "hdc_msg_hash", "ide_contract", "channels"):
    need(doc, k, "")
if "version" in doc and not re.match(r"^\d+\.\d+\.\d+$", str(doc["version"])):
    errs.append(f"version not semver: {doc.get('version')}")
if "$schema" not in doc:
    errs.append("missing $schema (expected ide-error-codes.schema.json)")

chs = doc.get("channels") or {}
for name in ("tconn", "file", "bm", "aa", "fport"):
    if name not in chs:
        errs.append(f"missing channels.{name}")
        continue
    ch = chs[name]
    for k in ("description", "success_patterns", "failures"):
        need(ch, k, f"channels.{name}")
    if not isinstance(ch.get("success_patterns"), list) or not ch.get("success_patterns"):
        errs.append(f"channels.{name}.success_patterns must be non-empty array")
    fails = ch.get("failures") or []
    if not isinstance(fails, list) or not fails:
        errs.append(f"channels.{name}.failures must be non-empty array")
    for i, f in enumerate(fails):
        for k in ("pattern", "when", "ide_hint"):
            need(f, k, f"channels.{name}.failures[{i}]")
        code = f.get("code", None)
        if code is not None and not re.match(r"^E\d{6}$", str(code)):
            errs.append(f"channels.{name}.failures[{i}].code invalid: {code}")

req = (schema.get("properties") or {}).get("channels", {}).get("required") or []
for name in req:
    if name not in chs:
        errs.append(f"schema requires channels.{name} but doc lacks it")

if errs:
    print("[FAIL] ide-error-codes validation:")
    for e in errs:
        print(" ", e)
    sys.exit(1)
print(f"[PASS] ide-error-codes.json version={doc.get('version')} channels={','.join(sorted(chs))} schema_ok")
sys.exit(0)
PY
