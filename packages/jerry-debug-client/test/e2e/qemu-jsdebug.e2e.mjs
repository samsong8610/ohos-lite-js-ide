#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// End-to-end check of @ohjs/jerry-debug-client against a real JerryScript 2.3 (protocol v9) engine that is
// reachable only through hdcd `fport` (see developtools_hdc lite/test/qemu-ide/run-qemu-hdcd.sh jsdebug).
//
//   pnpm --filter @ohjs/jerry-debug-client exec tsc -b && node test/e2e/qemu-jsdebug.e2e.mjs
//
// Env: RUN_QEMU_HDCD (path to run-qemu-hdcd.sh), HDC (host hdc binary), OHOS_HDC_SERVER_PORT (8711),
//      HOST_PORT (18710), LOCAL_PORT (19001), JERRY_LOG (engine stdout log), SKIP_ENV_SETUP=1 (env already up).
// Exit codes: 0 pass, 1 fail, 77 skipped (environment not available).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const RUN = process.env.RUN_QEMU_HDCD ?? '/workspace/hdcd-port/tools/run-qemu-hdcd.sh';
const HDC = process.env.HDC ?? '/workspace/hdcd-port/hdc-host';
const SERVER_PORT = process.env.OHOS_HDC_SERVER_PORT ?? '8711';
const HOST_PORT = process.env.HOST_PORT ?? '18710';
const LOCAL_PORT = Number(process.env.LOCAL_PORT ?? '19001');
const JERRY_LOG = process.env.JERRY_LOG ?? '/tmp/ohjs-fakeroot/run/jerry.log';
const SKIP_SETUP = process.env.SKIP_ENV_SETUP === '1';

const { JerryDebugClient } = await import(new URL('../../out/index.js', import.meta.url).href);

let failures = 0;
const pass = (m) => console.log(`[PASS] ${m}`);
const fail = (m) => {
  failures++;
  console.log(`[FAIL] ${m}`);
};
const check = (cond, m) => (cond ? pass(m) : fail(m));

const hdcEnv = { ...process.env, OHOS_HDC_SERVER_PORT: SERVER_PORT };
const hdc = (...args) => {
  const r = spawnSync(HDC, ['-s', `127.0.0.1:${SERVER_PORT}`, ...args], { env: hdcEnv, encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
};
const target = ['-t', `127.0.0.1:${HOST_PORT}`];

if (!SKIP_SETUP && (!existsSync(RUN) || !existsSync(HDC))) {
  console.log(`[SKIP] environment not available (RUN_QEMU_HDCD=${RUN}, HDC=${HDC})`);
  process.exit(77);
}

function teardown() {
  hdc(...target, 'fport', 'rm', `tcp:${LOCAL_PORT}`, 'tcp:5001');
  if (!SKIP_SETUP) {
    hdc('kill');
    spawnSync(RUN, ['jsdebug', 'stop'], { stdio: 'ignore' });
  }
}

/** Wait for the next event of `name` (optionally matching `pred`) or time out. */
function waitFor(client, name, ms = 10000, pred = () => true) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      client.off(name, on);
      reject(new Error(`timeout waiting for ${name}`));
    }, ms);
    const on = (ev) => {
      if (!pred(ev)) return;
      clearTimeout(t);
      client.off(name, on);
      resolve(ev);
    };
    client.on(name, on);
  });
}

let client;
try {
  if (!SKIP_SETUP) execFileSync(RUN, ['jsdebug', 'start'], { stdio: 'inherit' });
  await sleep(2000);

  const tconn = hdc('tconn', `127.0.0.1:${HOST_PORT}`);
  console.log(`tconn: ${tconn}`);
  check(/Connect OK|already/i.test(tconn), 'hdc tconn');
  const fport = hdc(...target, 'fport', `tcp:${LOCAL_PORT}`, 'tcp:5001');
  console.log(`fport: ${fport}`);
  check(/ok/i.test(fport), `fport tcp:${LOCAL_PORT} tcp:5001`);

  client = await JerryDebugClient.connect({ host: '127.0.0.1', port: LOCAL_PORT, timeoutMs: 10000 });
  const outputs = [];
  client.on('output', (o) => outputs.push(o.text));
  client.on('error', (e) => fail(`client error: ${e.message}`));
  check(
    client.config.version === 9,
    `config v${client.config.version} maxMsg=${client.config.maxMessageSize} cp=${client.config.cpointerSize} le=${client.config.littleEndian}`,
  );

  // jerry-main stops at the first statement; the source is parsed before that.
  const first = client.stopped
    ? { reason: 'entry', location: client.location }
    : await waitFor(client, 'stopped');
  check(
    first.location?.sourceName.endsWith('sample.js'),
    `initial stop ${first.reason} at ${first.location?.sourceName}:${first.location?.line}`,
  );

  const bp = client.setBreakpoint('sample.js', 3);
  check(bp.verified, `breakpoint sample.js:3 verified (id ${bp.id})`);

  const hitP = waitFor(client, 'stopped');
  client.continue();
  const hit = await hitP;
  check(
    hit.reason === 'breakpoint' && hit.location?.line === 3 && hit.breakpointIds.includes(bp.id),
    `breakpoint hit: ${hit.reason} at line ${hit.location?.line} in ${hit.location?.functionName}()`,
  );

  const bt = await client.backtrace({ total: true });
  const frames = bt.frames.map((f) => `${f.location?.sourceName}:${f.location?.line}`);
  console.log(`backtrace (total ${bt.total}): ${frames.join(' <- ')}`);
  check(
    bt.frames[0]?.location?.line === 3 &&
      bt.frames[0]?.location?.functionName === 'add' &&
      bt.frames.length >= 2,
    'backtrace frame 0 = add() sample.js:3',
  );

  const ev = await client.evaluate('a+b');
  check(ev.ok && ev.value === '10', `eval a+b = ${ev.value}`);

  const stepP = waitFor(client, 'stopped');
  client.stepOver();
  const step = await stepP;
  check(
    step.reason === 'step' && step.location?.line === 4,
    `step over -> line ${step.location?.line} (${step.reason})`,
  );
  const s = await client.evaluate('s');
  check(s.ok && s.value === '10', `eval s after step = ${s.value}`);

  client.clearAllBreakpoints();
  const closed = waitFor(client, 'close', 15000);
  client.continue();
  await closed;
  pass('engine closed the connection after continue (ran to end)');
  await sleep(500);
  const log = existsSync(JERRY_LOG) ? readFileSync(JERRY_LOG, 'utf8') : '';
  check(
    log.includes('done counter=33') || outputs.join('').includes('done counter=33'),
    'script completed: "done counter=33"',
  );
} catch (e) {
  fail(`exception: ${e?.stack ?? e}`);
} finally {
  try {
    client?.close();
  } catch {
    /* ignore */
  }
  teardown();
}
console.log(`RESULT=${failures === 0 ? 'PASS' : 'FAIL'} (${failures} failure(s))`);
process.exit(failures === 0 ? 0 : 1);
