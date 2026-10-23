# @ohjs/build

One-click build for OpenHarmony Lite JS FA modules (G2).

- **`fixture`** (default in CI): copies `src/main` into a HAP-shaped tree and packs a zip via **yazl** (no host `zip` binary).
- **`ace-loader`**: when `OHJS_ACE_LOADER_MAIN` or `.ohjs/toolchain.json` `{ "aceLoaderMain": "…" }` points at an upstream ace-loader CLI.

Output: `.ohjs/build/<module>.hap`.
