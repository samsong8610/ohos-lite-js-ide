# OpenHarmony Lite JS IDE (VS Code extension)

VS Code extension for ArkUI.Lite (JS) applications on OpenHarmony small-system devices
(2K0300 / LoongArch64, deviceType `smartVision`).

**Status: pre-release skeleton (M1 batch 1).** The extension activates only in OpenHarmony JS (FA) projects
(`entry/src/main/config.json` with `abilities[].srcLanguage = "js"` or a `module.js[]` section).
G2: **Build**, **Deploy**, **Launch**, **Stop**, and **Start/Stop Logs** commands are available for OHJS
projects. **Debug** (`type: ohjs`): deploy (optional), device marker handshake, `hdc fport` to Jerry port 5001, then `@ohjs/debug-adapter` + `@ohjs/jerry-debug-client`.

### qemu-ide jsdebug

1. `run-qemu-hdcd.sh jsdebug start` (developtools_hdc)
2. `OHOS_HDC_SERVER_PORT=8711` or `ohjs.tools.hdcServer` = `127.0.0.1:8711`
3. Connect target `127.0.0.1:18710` (jsdebug netns — not the G2 deploy tconn port 8710)
4. Launch **Debug OHJS App** with `localPort` 19001 (default)

License: Apache-2.0.
