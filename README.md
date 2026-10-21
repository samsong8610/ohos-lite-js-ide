# ohos-lite-js-ide

VS Code IDE for **OpenHarmony small-system ArkUI.Lite (JS/FA) applications** on the 2K0300 (LoongArch64)
board: language support for HML/CSS/JS, build (hvigor / ace-loader), deploy over hdc (OTG USB / TCP),
logs (hilogcat) and JerryScript on-device debugging.

Requirements, architecture and plan live in `SPEC.md`, `ARCHITECTURE.md` (v0.2+) and `PLAN.md`
(kept outside this repository for now).

> **Status:** M1, batch 1 — repository skeleton, platform abstraction + device profiles (I-2),
> hdc transport + mock-hdc (I-1), component schema extractor (M1-5). No end-user features yet.

## Layout

| Path                                                                                      | Content                                                                                            | Status           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------- |
| `packages/core`                                                                           | domain model, ports, `IPlatform` / `IProcessRunner` / `IToolLocator`, error model, device profiles | implemented      |
| `packages/transport-hdc`                                                                  | `HdcTransport`, hdc output parsers, error classification                                           | implemented      |
| `packages/schemas`                                                                        | generated versioned component schemas (`v5.0.3`, `v6.1-lts`) + loader                              | implemented      |
| `packages/test-kit`                                                                       | `mock-hdc` executable test double                                                                  | implemented (v1) |
| `packages/extension`                                                                      | VS Code extension entry, manifest, built-in device profiles                                        | skeleton         |
| `tools/schema-extractor`                                                                  | extracts schemas from OpenHarmony sources                                                          | implemented      |
| `packages/{build,language-server,ts-plugin,debug-adapter,transport-ssh,transport-serial}` |                                                                                                    | placeholders     |
| `tools/{grammar,firmware-patches}`, `templates/`                                          |                                                                                                    | placeholders     |

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

## License

Apache-2.0, see [LICENSE](LICENSE).
