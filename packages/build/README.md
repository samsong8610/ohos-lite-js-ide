# @ohjs/build

One-click build for OpenHarmony Lite JS FA modules (G2, FR-BLD-002).

The VS Code command **OHJS: Clean** calls `cleanBuildOutputs(workspaceRoot)` to delete `.ohjs/build` and each module's `build/` tree only.

## Backends

| Backend          | When                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| **`fixture`**    | Explicit backend or CI default when ace-loader is not configured                     |
| **`ace-loader`** | Webpack lite build + FA HAP pack (`config.json`, `assets/…`, `pack.info`)            |
| **`auto`**       | ace-loader when install is discovered; otherwise fixture (unless manual paths below) |

When **`ohjs.build.aceLoaderPath`**, **`ohjs.tools.restoolPath`**, or env ace-loader overrides are set, OHJS **does not** silently fall back to the fixture source-tree HAP if webpack or pack fails — the build fails with `BLD-FAILED` / `BLD-TOOL-MISSING` instead. Check the OHJS output channel for `build (ace-loader):` vs `build (fixture):` (fixture is CI/smoke only, zip contains `src/main/…`, not gold `assets/js/…`).

## ace-loader discovery (in order)

1. `BuildOptions.aceLoaderMain` / env **`OHJS_ACE_LOADER_MAIN`**
2. `.ohjs/toolchain.json`: `{ "aceLoaderMain": "…", "aceLoaderRoot": "…" }`
3. VS Code **`ohjs.build.aceLoaderPath`** (ace-loader checkout root)
4. Env **`OHJS_ACE_LOADER_ROOT`** (optional root override)
5. **Auto-provisioned** install under extension globalStorage (`OpenHarmony-v5.0.3-Release` tag, ace-loader **1.0.11**)

Valid install: `<root>/webpack.lite.config.js` and `<root>/node_modules/webpack/bin/webpack.js` (run `npm install` in upstream `ace-loader`).

### Auto-provision (VS Code extension)

When backend is **`auto`** or **`ace-loader`**, no manual path/env/toolchain entry is set, and globalStorage has no
ready install, OHJS **git sparse-clones** tag **`OpenHarmony-v5.0.3-Release`** from
[samsong8610/developtools_ace_js2bundle](https://github.com/samsong8610/developtools_ace_js2bundle) (`ace-loader/`
only), runs **`npm install --omit=dev`**, and reuses the result. Progress goes to the OHJS output channel /
notification. Failures surface a clear error; set **`ohjs.build.aceLoaderPath`** or **`OHJS_ACE_LOADER_ROOT`** to
override. The vsix does **not** bundle ace-loader.

Upstream manual checkout: same repo or OpenHarmony `developtools_ace_js2bundle` → `ace-loader/`.

## Webpack invocation

From ace-loader root, OHJS runs:

```bash
node node_modules/webpack/bin/webpack.js \
  --config webpack.lite.config.js \
  --env buildMode=debug
```

With environment (also merged into the process env):

| Variable            | Default                                              | Purpose                                   |
| ------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `DEVICE_LEVEL`      | `lite`                                               | Lite device pipeline                      |
| `DEVICE_TYPE`       | `smartVision`                                        | Device profile                            |
| `aceModuleRoot`     | prepared JS tree under `.ohjs/build/ace-module-root` | ace-loader source root                    |
| `aceModuleBuild`    | `.ohjs/build/ace-js`                                 | Compiled JS output                        |
| `buildMode`         | `debug`                                              | `debug` or `release`                      |
| `aceManifestPath`   | `<aceModuleRoot>/manifest.json`                      | Generated from `config.json` when missing |
| `aceAbilitySrcPath` | ability `srcPath` from `config.json`                 | FA JS folder under `assets/js/`           |

## HAP content (primary acceptance)

Pack step validates **real** Jerry bytecode (`JRRY1` magic on every `.bc`) and **Restool** `resources.index` (`Restool ` header). The packer does **not** synthesize placeholder `.bc` or index files.

Set VS Code **`ohjs.tools.restoolPath`** or env **`OHJS_RESTOOL`** to the OpenHarmony SDK `toolchains/restool`
binary (setting wins when both are set; same invocation as DevEco: `-i src/main -j config.json -p bundleName -o … -r ResourceTable.txt -f`). **restool is not auto-downloaded.**

Example:

```bash
export OHJS_RESTOOL=/path/to/openharmony/sdk/toolchains/restool
# Windows example: C:\OpenHarmony\Sdk\11\toolchains\restool.exe
```

See `docs/GOLD-HAP-ACCEPTANCE.md` for gold zip member paths and content checks.

Example toolchain (workspace `.ohjs/toolchain.json`):

```json
{
  "aceLoaderRoot": "/path/to/developtools_ace_js2bundle/ace-loader"
}
```

Example env:

```bash
export OHJS_ACE_LOADER_ROOT=/path/to/developtools_ace_js2bundle/ace-loader
export OHJS_BUILD_BACKEND=ace-loader
```

## CI fake ace-loader

Unit tests use `packages/build/test/fixtures/fake-ace-loader/`, which **replays** DevEco `loader_out_lite` output (`hellolite-deveco-loader-out`, real `JRRY1` `.bc`). **`OHJS_RESTOOL`** in CI points at `test/fixtures/restool-shim/restool.cjs` (hellolite gold table only). Optional integration: set **`OHJS_ACE_LOADER_MAIN`** to a real ace-loader root with lite snapshot plugin.

Output (ace-loader): `<module>/build/default/outputs/default/app/<module>-default.hap`, with `pack.info` in `<module>/build/default/outputs/default/pack.info`. Staging under `.ohjs/build/` when using the extension default out dir.
