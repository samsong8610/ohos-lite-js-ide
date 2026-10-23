# PLAN (in-repo snapshot)

Product requirements live in the external spec pack; this file tracks **G2** delivery in `ohos-lite-js-ide`.

## G2 — build, deploy, logs (implemented)

| Step          | VS Code command                      | Notes                                                                                                                           |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Build         | `OHJS: Build` (`ohjs.project.build`) | `@ohjs/build` → `.ohjs/build/<module>.hap` (fixture zip in CI; ace-loader when `OHJS_ACE_LOADER_MAIN` / `.ohjs/toolchain.json`) |
| Deploy        | `OHJS: Deploy`                       | `hdc file send …/app.hap`, `bm install` (stdout `resultMessage`)                                                                |
| Launch / Stop | `OHJS: Launch` / `Stop`              | `aa start` / `aa terminate` (failure: `Failed to run the command.`)                                                             |
| Logs          | `OHJS: Start Logs` / `Stop Logs`     | Device background `hilogcat` + pid file; host `tail -F` → OHJS output                                                           |
| One-shot      | `OHJS: Build, Deploy and Launch`     | Chains the three steps                                                                                                          |

### qemu-ide / hdc TCP

1. Start stub: `developtools_hdc` `run-qemu-hdcd.sh` (see jerry e2e for env names).
2. Host server on non-default port: `OHOS_HDC_SERVER_PORT=8711` **or** `ohjs.tools.hdcServer` = `127.0.0.1:8711`.
3. Connect target: `hdc tconn 127.0.0.1:8710` (profile `connection.tcpPort`; confirm against `run-qemu-hdcd.sh start` output). Jerry **jsdebug** qemu mode may forward a different host port (18710) — see `packages/jerry-debug-client/test/e2e/qemu-jsdebug.e2e.mjs`.
4. Use 6.1-LTS host `hdc` (Ver 3.2.0c) — version-aware selection from PR #1.

### Result detection

- **Plain shell**: append `; echo __RC=$?` — do not trust hdc shell exit status alone.
- **bm / aa**: exit code always 0; match stdout (`install success`, `ERR_…`, `Failed to run the command.`, `bm set -s disable` → `success` = debug firmware).
- **Deploy path**: remote `/tmp/ohjs/app.hap` (must end with `.hap`).
- **Debug markers**: clear `/data/ohjs/debug.*` before deploy and on install/start failure.

Optional e2e (skip exit 77 when qemu absent): `node packages/transport-hdc/test/e2e/qemu-deploy.e2e.mjs`.

## G4 — VS Code Jerry debug (implemented)

| Step            | VS Code                                           | Notes                                                               |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Debug launch    | Run and Debug → **Debug OHJS App** (`type: ohjs`) | Optional `preDeploy` uses G2 build/deploy                           |
| Device contract | `@ohjs/debug-adapter` `launchJerryOnDevice`       | marker → `aa start` → `fport` → Jerry → delete marker               |
| DAP             | `dist/debugAdapter.js`                            | breakpoints, step, stack, scopes, evaluate                          |
| qemu jsdebug    | `skipAppStart` in e2e only                        | `run-qemu-hdcd.sh jsdebug` + tconn **18710** (not 8710 deploy port) |

Optional e2e: `node packages/debug-adapter/test/e2e/qemu-jsdebug-dap.e2e.mjs` (after `tsc -b`).
