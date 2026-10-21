# @ohjs/test-kit

Test doubles (never shipped in the VSIX).

## mock-hdc (v1)

`mock-hdc/bin/hdc` (posix) / `mock-hdc/bin/hdc.cmd` (Windows) is an executable replacement for the
OpenHarmony `hdc` client, so `HdcTransport` is tested through the real `IProcessRunner` code path.
Point `ohjs.tools.hdcPath` at it for manual testing.

State lives in `$MOCK_HDC_STATE` (targets, fport rules, call log, virtual device fs under `fs/<key>/`);
the scenario comes from `$MOCK_HDC_SCENARIO` (JSON, see `MockHdcScenario` in `src/index.ts`).

Supported: `-v`, `list targets [-v]`, `tconn`, `-t <key>`, `shell` (builtins `echo mkdir touch rm ls cat`
plus scenario rules for `bm`/`aa`/`hilogcat`, `;` chains and `$?`), `file send|recv`, `fport` / `fport ls` /
`fport rm`. Fault injection: `hang`, `serverDown`, `raw` (fixed output, incl. GBK bytes), `busyPorts`,
offline / unauthorized targets.

Output strings follow the `developtools_hdc` 5.0.3 sources. They are **not yet verified against a real
2K0300 board** (V-4 records device samples once hdcd runs, see PLAN §4.2).

Not yet: real TCP forwarding for `fport` (needed with mock-jerry-server in M3), YAML scenarios.
