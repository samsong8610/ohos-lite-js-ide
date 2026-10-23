# @ohjs/debug-adapter

VS Code **Debug Adapter Protocol** bridge for JerryScript debugger protocol v9 on OpenHarmony lite devices.

## Device lifecycle (IDE contract)

1. `mkdir -p /data/ohjs && touch /data/ohjs/debug.<bundle>`
2. `aa start -p <bundle> -n <ability>`
3. `hdc fport tcp:<localPort> tcp:5001` (device port from profile `debug.port`)
4. Connect `@ohjs/jerry-debug-client` to `127.0.0.1:<localPort>`
5. `rm -f /data/ohjs/debug.*` after a successful connect

Markers are also cleared on failure, session end, and before deploy (`LiteDeployService`).

## Usage

The VS Code extension launches `./dist/debugAdapter.js` (bundled entry: `src/debug-main.ts`).

Programmatic helpers:

```ts
import { launchJerryOnDevice, OhjsDebugSession } from '@ohjs/debug-adapter';
```

## Tests

- Unit: `pnpm test` (lifecycle with mock-hdc)
- Optional e2e (qemu jsdebug, exit 77 if env missing):

  ```bash
  pnpm --filter @ohjs/debug-adapter exec tsc -b
  node packages/debug-adapter/test/e2e/qemu-jsdebug-dap.e2e.mjs
  ```

See also `packages/jerry-debug-client/test/e2e/qemu-jsdebug.e2e.mjs` for the low-level client check.
