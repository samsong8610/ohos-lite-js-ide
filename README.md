# ohos-lite-js-ide

VS Code IDE for **OpenHarmony small-system ArkUI.Lite (JS/FA) applications** on the 2K0300 (LoongArch64)
board: language support for HML/CSS/JS, build (hvigor / ace-loader), deploy over hdc (OTG USB / TCP),
logs (hilogcat) and JerryScript on-device debugging.

Requirements, architecture and plan live in `SPEC.md`, `ARCHITECTURE.md` (v0.2+) and `PLAN.md`
(kept outside this repository for now).

> **Status:** M1 language + **G2** build/deploy/logs (one-click `.hap` build, hdc deploy/launch, hilog
> streaming). JerryScript debug client (PR #2). See [PLAN.md](PLAN.md) for G2/qemu-ide notes.

## Layout

| Path                                                                                | Content                                                                                            | Status           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------- |
| `packages/core`                                                                     | domain model, ports, `IPlatform` / `IProcessRunner` / `IToolLocator`, error model, device profiles | implemented      |
| `packages/transport-hdc`                                                            | `HdcTransport`, hdc output parsers, error classification                                           | implemented      |
| `packages/schemas`                                                                  | generated versioned component schemas (`v5.0.3`, `v6.1-lts`) + loader                              | implemented      |
| `packages/test-kit`                                                                 | `mock-hdc` executable test double                                                                  | implemented (v1) |
| `packages/extension`                                                                | VS Code extension: LSP, device refresh, **build/deploy/logs commands**                             | G2 slice         |
| `packages/build`                                                                    | `@ohjs/build` — fixture HAP zip + optional ace-loader hook                                         | G2 slice         |
| `tools/schema-extractor`                                                            | extracts schemas from OpenHarmony sources                                                          | implemented      |
| `packages/{language-server,ts-plugin,debug-adapter,transport-ssh,transport-serial}` |                                                                                                    | partial / stub   |
| `tools/{grammar,firmware-patches}`, `templates/`                                    |                                                                                                    | placeholders     |

## Getting started

```bash
corepack enable          # pnpm 10
pnpm install
pnpm run build           # tsc -b + esbuild bundle of the extension
pnpm run lint            # eslint + prettier --check + license headers
pnpm run test:coverage   # vitest + v8 coverage gates
pnpm run test:integration  # @vscode/test-electron smoke test (Linux: wrap with xvfb-run -a)
pnpm run ci:package      # vsce package
```

Node.js ≥ 20.19. Tier-1 host platform is Windows 10/11 x64; macOS / Linux are tier 2 (build + unit tests).

## Platform rule

Business code must not use `child_process`, `os.platform()`, `process.platform`, `path.win32/posix`.
Use `IPlatform` / `IProcessRunner` from `@ohjs/core`. ESLint enforces this outside
`packages/core/src/platform/**` and test code (NFR-PLT-004).

## CI

- `.gitcode/workflows/ci.yml` — AtomGit (Linux only): lint, build, typecheck, schema check, unit + coverage, smoke, package.
- `.github/workflows/ci.yml` — GitHub mirror: Windows / macOS / Ubuntu matrix.

CI only runs mocks. Real-device tests are run locally (`pnpm device:selftest`, `pnpm e2e:device`, planned).

## Host `hdc` and device OpenHarmony version

Deploy uses a host `hdc` client that must match the board’s OpenHarmony line (at least **5.0.x** vs **6.1.x**).
TCP `hdcd` listens on port **8710** (device profile default); this repo does not change the daemon.

Resolution order:

1. **`ohjs.tools.hdcPath`** — explicit executable (wins over everything).
2. **`.ohjs/toolchain.json`** — optional `{ "hdc": "…", "ohVersion": "5.0.3" }`.
3. **Auto-detect** — with exactly one connected target, read `/etc/ohjs/runtime-manifest.json` (from the
   active device profile) or `param get const.product.software.version` / related keys, then locate
   `hdc` under `<extension>/bin/<platform>/v5.0.3/` or `…/v6.1-lts/` (legacy flat `…/bin/<platform>/hdc`
   still works).
4. **`ohjs.tools.hdcOhVersion`** — force `5.0.3` or `6.1-lts` when autodetection fails.
5. Before connect, the project **SDK** (`.ohjs/project.json` / `ohjs.sdkVersion`) selects the initial
   bundled/SDK search path.

Verify: run **OHJS: Refresh devices**, check the OHJS output channel for
`hdc (…) … [toolchain 5.0.3]` or `[device OH … → toolchain …]`. With mock-hdc, set `ohjs.tools.hdcPath`
to `packages/test-kit/mock-hdc/bin/hdc` and use a scenario `shell` rule for `param get`.

### G2 build / deploy / logs

Commands (OHJS category): **Build**, **Deploy**, **Launch**, **Stop**, **Start Logs**, **Stop Logs**, and
**Build, Deploy and Launch**. Settings: `ohjs.tools.hdcServer` (e.g. `127.0.0.1:8711` for qemu-ide),
`ohjs.device.targetKey`, `ohjs.build.backend` (`fixture` | `ace-loader` | `auto`).

- Shell exit codes: hdc wraps commands with `; echo __RC=$?` (see `@ohjs/transport-hdc`); bm/aa success is
  parsed from stdout, not exit code.
- Deploy sends the HAP to `/tmp/ohjs/app.hap`, clears `/data/ohjs/debug.*`, then `bm install`.
- Logs: device-side `hilogcat` background + pid file under `/tmp/ohjs/hilogcat.pid`; host tails the capture file.

qemu-ide stub: see [PLAN.md](PLAN.md) and `packages/transport-hdc/test/e2e/qemu-deploy.e2e.mjs` (exit 77 when absent).

## License

Apache-2.0, see [LICENSE](LICENSE).
