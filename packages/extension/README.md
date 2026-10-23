# OpenHarmony Lite JS IDE (VS Code extension)

VS Code extension for ArkUI.Lite (JS) applications on OpenHarmony small-system devices
(2K0300 / LoongArch64, deviceType `smartVision`).

**Status: pre-release skeleton (M1 batch 1).** The extension activates only in OpenHarmony JS (FA) projects
(`entry/src/main/config.json` with `abilities[].srcLanguage = "js"` or a `module.js[]` section).
G2: **Build**, **Deploy**, **Launch**, **Stop**, and **Start/Stop Logs** commands are available for OHJS
projects. JerryScript debugging is provided via `@ohjs/jerry-debug-client` (separate flow).

License: Apache-2.0.
