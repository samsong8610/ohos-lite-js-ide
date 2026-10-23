# G4 host use-case checklist (no board)

Gate date: **2026-10-23**. Validates the **host-only** Jerry debug path Sam/PM can demo without USB or a real 2K0300. On-device Jerry bring-up stays deferred to a later gate.

## Automated one-click smoke (engineers / CI)

From repo root after `pnpm install`:

```bash
pnpm run smoke:g4-mock
# or: bash scripts/smoke-g4-mock.sh
```

Expect terminal line `RESULT=0`. Uses `packages/test-kit/mock-hdc`, the `oh-project` fixture bundle, and an in-process Jerry v9 mock (same protocol helpers as `@ohjs/jerry-debug-client` unit tests): **tconn** → debug marker → **aa start** → **fport** → connect → **breakpoint / pause / continue**, no VS Code UI and no USB.

Optional env: `G4_MOCK_TCONN`, `G4_MOCK_LOCAL_PORT`, `OHJS_FIXTURE_ROOT`, `SKIP_BUILD=1` (see script header in `scripts/smoke-g4-mock.sh`).

## Manual VS Code walkthrough (PM demo)

Prerequisites: Node 20+, `pnpm install`, `pnpm run ci:package`, mock hdc path configured, mock Jerry **not** required for manual UI (use real qemu jsdebug or defer live debug to a connected board).

| Step | Action | Expected |
| ---- | ------ | -------- |
| 1 | Install VSIX from `packages/extension/*.vsix` | Extension **OHOS Lite JS IDE** activates in an OHJS workspace |
| 2 | Set `ohjs.tools.hdcPath` to repo `packages/test-kit/mock-hdc/bin/hdc` | Setting saved |
| 3 | Open or create an OHJS project (`entry/src/main/config.json`, `.ohjs/project.json`) | Explorer shows `pages/` JS sources |
| 4 | **OHJS: Build** (or enable `preDeploy` on debug launch) | Output **OHJS**: `build (fixture): …/entry.hap` |
| 5 | Terminal: `hdc tconn 127.0.0.1:8720` against mock with `reachable` scenario (or USB-style target in automation) | **OHJS** device refresh lists connected target |
| 6 | Open `pages/index/index.js` (or main page JS), set a breakpoint on a breakable line | Gutter breakpoint (unverified until debug session starts) |
| 7 | Run and Debug → **Debug OHJS App** (`type: ohjs`) | Debug toolbar active; no immediate activation error |
| 8 | First stop (stop-on-entry) | **Debug Console**: stopped at entry / `pages/…`; Variables / Call Stack populated when Jerry is reachable |
| 9 | **Continue** (F5) then hit the breakpoint | **Debug Console**: `Stopped on breakpoint`; breakpoint gutter shows verified |
| 10 | **Pause** / **Continue** once more, then **Stop** | Session ends; Output **OHJS** shows deploy/install when `preDeploy` ran; no orphan `fport` error in Output |

With **mock-hdc only** (no Jerry TCP), steps 8–10 require a real Jerry endpoint (qemu `jsdebug` or hardware). The automated smoke in the previous section covers the full **adapter + protocol** path without that endpoint.

### Out of scope for G4 host gate

- Real USB OTG or 2K0300 hardware (same deferral as G3)
- Signed release HAP / production firmware checks
- qemu-ide optional e2e (`packages/debug-adapter/test/e2e/qemu-jsdebug-dap.e2e.mjs`, exit 77 when skipped)

### Related automation

- G3 deploy/logs host gate: `pnpm run smoke:g3-mock`, [G3-HOST-UC.md](G3-HOST-UC.md)
- Unit/integration: `pnpm test`, `pnpm run test:integration`
- VSIX debug adapter assert: `pnpm run ci:package` (`scripts/check-vsix-debug-adapter.mjs`)
