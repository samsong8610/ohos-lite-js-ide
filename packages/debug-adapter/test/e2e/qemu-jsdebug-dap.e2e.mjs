#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Smoke test: fport + Jerry connect via launchJerryOnDevice (skipAppStart for qemu jsdebug).
//
//   pnpm --filter @ohjs/debug-adapter exec tsc -b && node test/e2e/qemu-jsdebug-dap.e2e.mjs
//
// Exit 77 when RUN_QEMU_HDCD / HDC are missing.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const RUN = process.env.RUN_QEMU_HDCD ?? '/workspace/hdcd-port/tools/run-qemu-hdcd.sh';
const HDC = process.env.HDC ?? '/workspace/hdcd-port/hdc-host';
const SERVER_PORT = process.env.OHOS_HDC_SERVER_PORT ?? '8711';
const HOST_PORT = process.env.HOST_PORT ?? '18710';
const LOCAL_PORT = Number(process.env.LOCAL_PORT ?? '19001');
const SKIP_SETUP = process.env.SKIP_ENV_SETUP === '1';

const __dir = dirname(fileURLToPath(import.meta.url));

const { launchJerryOnDevice, teardownJerryOnDevice } = await import(
  new URL('../../out/device-lifecycle.js', import.meta.url).href
);
const { HdcTransport, LiteDeployService } = await import('@ohjs/transport-hdc');
const { DeviceProfileRegistry, NodeProcessRunner, createHostPlatform } = await import('@ohjs/core');

const profileJson = JSON.parse(
  readFileSync(join(__dir, '../../../extension/device-profiles/2k0300-linux-1024x768.json'), 'utf8'),
);
const registry = new DeviceProfileRegistry();
registry.add(profileJson, 'builtin');
const profile = registry.resolve(profileJson.id);

if (!SKIP_SETUP && (!existsSync(RUN) || !existsSync(HDC))) {
  console.log(`[SKIP] environment not available (RUN_QEMU_HDCD=${RUN}, HDC=${HDC})`);
  process.exit(77);
}

const hdcEnv = { ...process.env, OHOS_HDC_SERVER_PORT: SERVER_PORT };
const target = `127.0.0.1:${HOST_PORT}`;

function hdc(...args) {
  const r = spawnSync(HDC, ['-s', `127.0.0.1:${SERVER_PORT}`, ...args], { env: hdcEnv, encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
}

function teardownEnv() {
  hdc('-t', target, 'fport', 'rm', `tcp:${LOCAL_PORT}`, 'tcp:5001');
  if (!SKIP_SETUP) {
    hdc('kill');
    spawnSync(RUN, ['jsdebug', 'stop'], { stdio: 'ignore' });
  }
}

let client;
let forward;
let runner;
try {
  if (!SKIP_SETUP) execFileSync(RUN, ['jsdebug', 'start'], { stdio: 'inherit' });
  await sleep(2000);
  console.log(hdc('tconn', target));

  runner = new NodeProcessRunner(createHostPlatform());
  const transport = new HdcTransport({ hdcPath: HDC, runner, env: hdcEnv });
  const deploy = new LiteDeployService({ transport, profile });

  ({ client, forward } = await launchJerryOnDevice(
    { transport, deploy },
    {
      target,
      bundle: 'com.example.jsdebug',
      ability: 'default',
      localPort: LOCAL_PORT,
      remoteDebugPort: profile.debug.port,
      skipAppStart: true,
    },
  ));
  console.log(`[PASS] connected jerry v${client.config.version}, stopped=${client.stopped}`);
  await teardownJerryOnDevice({ deploy }, target, client, forward);
  client = undefined;
  forward = undefined;
} catch (e) {
  console.error('[FAIL]', e?.stack ?? e);
  process.exitCode = 1;
} finally {
  runner?.disposeAll?.();
  teardownEnv();
}
process.exit(process.exitCode ?? 0);
