# G3 host use-case checklist (no board)

Gate date: **2026-10-29**. Validates the **host-only** path Sam/PM can demo without USB or a real 2K0300. On-device bring-up is deferred to a later gate.

## Automated one-click smoke (engineers / CI)

From repo root after `pnpm install`:

```bash
pnpm run smoke:g3-mock
# or: bash scripts/smoke-g3-mock.sh
```

Expect terminal line `RESULT=0`. Uses `packages/test-kit/mock-hdc` and the `oh-project` fixture — fixture **build**, **TCP tconn**, **deploy / install / start**, and **hilog line parse** (same parsers as the Output channel), no VS Code UI and no USB.

Optional env: `G3_MOCK_TCONN`, `G3_MOCK_HILOG_LINE`, `OHJS_FIXTURE_ROOT`, `SKIP_BUILD=1` (see script header in `scripts/smoke-g3-mock.sh`).

## Manual VS Code walkthrough (PM demo)

Prerequisites: Node 20+, `pnpm install`, `pnpm run ci:package`, mock hdc path configured.

| Step | Action                                                                                                                                                        | Expected                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | Install VSIX from `packages/extension/*.vsix` (Extensions → Install from VSIX…)                                                                               | Extension **OHOS Lite JS IDE** appears; no activation error                                        |
| 2    | Set `ohjs.tools.hdcPath` to repo `packages/test-kit/mock-hdc/bin/hdc` (User or Workspace settings)                                                            | Setting saved                                                                                      |
| 3    | Command palette → **OHJS: New Project**                                                                                                                       | Wizard: template → SDK → device profile → bundle → folder                                          |
| 4    | Choose template **empty** or **list-demo**; SDK **6.1-lts**; profile **2K0300…**; pick an empty folder                                                        | Project opens; `.ohjs/project.json` present                                                        |
| 5    | **OHJS: Build**                                                                                                                                               | Output channel: `build (fixture): …/entry.hap` (or `ace-loader` when toolchain configured)         |
| 6    | _(Optional host path)_ Terminal: `hdc tconn 127.0.0.1:8710` against mock with `reachable` scenario — or skip and use USB-style mock target in automation only | For manual mock TCP, device list shows connected target after tconn                                |
| 7    | **OHJS: Deploy**                                                                                                                                              | Output: `deploy: installed /tmp/ohjs/app.hap`                                                      |
| 8    | **OHJS: Launch**                                                                                                                                              | Output: `launch: <bundle>/default`; toast **OHJS: app launched**                                   |
| 9    | **OHJS: Start Logs** / **Stop Logs**                                                                                                                          | Output shows parsed hilog lines (`… I A0/ACE: …`) while streaming; `logs: capture stopped` on stop |
| 10   | **OHJS: Build, Deploy and Launch** (one-shot)                                                                                                                 | Chains steps 5–8 without error                                                                     |

### Out of scope for G3 host gate

- Real USB enumeration, OTG cable, or 2K0300 hardware
- Signed HAP / release firmware (`bm set -s disable` failure paths — covered in unit tests)
- Jerry debug on device (G4); qemu-ide optional e2e remains separate

### Related automation

- Unit/integration: `pnpm test`, `pnpm run test:integration` (ubuntu: xvfb)
- Optional qemu: `node packages/transport-hdc/test/e2e/qemu-deploy.e2e.mjs` (requires hdc stub; exit 77 when skipped)
