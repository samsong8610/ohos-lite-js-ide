#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Optional G2 smoke against developtools_hdc qemu-ide (run-qemu-hdcd.sh).
//   pnpm run build && node packages/transport-hdc/test/e2e/qemu-deploy.e2e.mjs
// Env: RUN_QEMU_HDCD, HDC, OHOS_HDC_SERVER_PORT (8711), HOST_PORT (18710). Exit 77 when skipped.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUN = process.env.RUN_QEMU_HDCD ?? '/workspace/hdcd-port/tools/run-qemu-hdcd.sh';
const HDC = process.env.HDC ?? '/workspace/hdcd-port/hdc-host';
const SERVER_PORT = process.env.OHOS_HDC_SERVER_PORT ?? '8711';
const HOST_PORT = process.env.HOST_PORT ?? '18710';

if (!existsSync(RUN) || !existsSync(HDC)) {
  console.log('[SKIP] qemu-ide / hdc not available');
  process.exit(77);
}

const hdcEnv = { ...process.env, OHOS_HDC_SERVER_PORT: SERVER_PORT };
const hdc = (...args) => {
  const r = spawnSync(HDC, ['-s', `127.0.0.1:${SERVER_PORT}`, ...args], { env: hdcEnv, encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
};

try {
  execFileSync(RUN, ['start'], { stdio: 'inherit' });
} catch {
  console.log('[SKIP] run-qemu-hdcd.sh start failed');
  process.exit(77);
}

console.log(hdc('tconn', `127.0.0.1:${HOST_PORT}`));
const dir = mkdtempSync(join(tmpdir(), 'ohjs-qemu-'));
const hap = join(dir, 'app.hap');
writeFileSync(hap, 'qemu-smoke');
console.log(hdc('-t', `127.0.0.1:${HOST_PORT}`, 'file', 'send', hap, '/tmp/ohjs/app.hap'));
console.log(hdc('-t', `127.0.0.1:${HOST_PORT}`, 'shell', 'ls /tmp/ohjs/app.hap; echo __RC=$?'));
hdc('kill');
spawnSync(RUN, ['stop'], { stdio: 'ignore' });
rmSync(dir, { recursive: true, force: true });
console.log('[PASS] qemu deploy file send');
