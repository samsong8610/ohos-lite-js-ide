/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// HdcTransport against the mock-hdc executable through the real NodeProcessRunner (I-1, FR-DEP-007).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CancellationTokenSource,
  NodeProcessRunner,
  createHostPlatform,
  isOhjsError,
  type IProcessRunner,
} from '@ohjs/core';
import { createMockHdc, type MockHdc, type MockHdcScenario } from '@ohjs/test-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { HdcTransport, isTransportError } from './hdc-transport';

const runner = new NodeProcessRunner(createHostPlatform());
const mocks: MockHdc[] = [];
afterEach(() => mocks.splice(0).forEach((m) => m.dispose()));

const USB = '7001005458323933328a01ab';
function setup(scenario: MockHdcScenario = {}, timeouts = {}): { t: HdcTransport; m: MockHdc } {
  const m = createMockHdc({
    targets: [{ key: USB, name: '2k0300' }],
    reachable: ['192.168.1.20:8710'],
    ...scenario,
  });
  mocks.push(m);
  return { t: new HdcTransport({ hdcPath: m.hdcPath, runner, env: m.env, timeouts }), m };
}

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  return isOhjsError(e) ? e.code : `not an OhjsError: ${String(e)}`;
}

describe('HdcTransport', () => {
  it('version and capabilities', async () => {
    const { t } = setup({ version: '3.2.0c' });
    expect(await t.version()).toBe('3.2.0c');
    expect(t.capabilities()).toEqual({ forward: true, stream: true, fileTransfer: true });
    expect(t.id).toBe('hdc');
  });

  it('builds argv with global args and target', () => {
    const t = new HdcTransport({ hdcPath: 'hdc', runner, globalArgs: ['-s', '127.0.0.1:8710'] });
    expect(t.command(['shell', 'ls'], 'K').args).toEqual(['-s', '127.0.0.1:8710', '-t', 'K', 'shell', 'ls']);
  });

  it('lists targets, connects over TCP (tconn) and lists again', async () => {
    const { t } = setup();
    expect(await t.listTargets()).toEqual([
      { key: USB, connType: 'USB', state: 'Connected', name: '2k0300' },
    ]);
    await t.connect('192.168.1.20:8710');
    const list = await t.listTargets();
    expect(list.map((d) => `${d.key}/${d.connType}`)).toEqual([`${USB}/USB`, '192.168.1.20:8710/TCP']);
  });

  it('empty target list is not an error', async () => {
    const { t } = setup({ targets: [] });
    expect(await t.listTargets()).toEqual([]);
  });

  it('tconn failures and endpoint validation', async () => {
    const { t } = setup();
    expect(await code(t.connect('10.9.9.9:8710'))).toBe('TRN-HDCD-UNREACHABLE');
    expect(await code(t.connect('not an endpoint'))).toBe('TRN-HDC-CONNECT-FAILED');
    await expect(t.connect('[fe80::1]:8710')).rejects.toThrow();
  });

  it('shell returns output and the device exit code', async () => {
    const { t } = setup({ shell: [{ match: '^bm dump -l', stdout: 'com.example.app' }] });
    expect(await t.shell(USB, 'echo hello')).toEqual({ exitCode: 0, output: 'hello\n' });
    expect(await t.shell(USB, 'bm dump -l')).toEqual({ exitCode: 0, output: 'com.example.app\n' });
    const r = await t.shell(USB, 'nosuchcmd');
    expect(r.exitCode).toBe(127);
    expect(r.output).toContain('not found');
  });

  it('shell with an unknown / offline / unauthorized target', async () => {
    const { t } = setup({
      targets: [
        { key: 'OFF', state: 'Offline' },
        { key: 'UNAUTH', state: 'Unauthorized' },
      ],
    });
    expect(await code(t.shell('nope', 'ls'))).toBe('TRN-HDC-TARGET-NOT-FOUND');
    expect(await code(t.shell('UNAUTH', 'ls'))).toBe('TRN-HDC-UNAUTHORIZED');
    expect(await code(t.shell('OFF', 'ls'))).toBe('TRN-HDC-FAILED');
  });

  it('file send / recv round trip with stats (FR-HDC-005 hash check)', async () => {
    const { t, m } = setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdc-t-'));
    const local = path.join(dir, 'app 中文.hap');
    const payload = Buffer.alloc(256 * 1024, 7);
    fs.writeFileSync(local, payload);
    expect((await t.shell(USB, "mkdir -p '/tmp/ohjs'")).exitCode).toBe(0);
    const stats = await t.pushWithStats(USB, local, '/tmp/ohjs/app.hap');
    expect(stats.sizeBytes).toBe(payload.length);
    expect(fs.readFileSync(m.devicePath(USB, '/tmp/ohjs/app.hap')).equals(payload)).toBe(true);
    const back = path.join(dir, 'back.hap');
    await t.pull(USB, '/tmp/ohjs/app.hap', back);
    expect(fs.readFileSync(back).equals(payload)).toBe(true);
    await t.push(USB, local, '/tmp/ohjs/again.hap');
  });

  it('file transfer errors are classified', async () => {
    const { t } = setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdc-t-'));
    const local = path.join(dir, 'a.bin');
    fs.writeFileSync(local, 'x');
    expect(await code(t.push(USB, local, '/missing/dir/a.bin'))).toBe('TRN-HDC-REMOTE-PATH');
    expect(await code(t.pull(USB, '/nope', path.join(dir, 'b')))).toBe('TRN-HDC-REMOTE-PATH');
    expect(await code(t.push(USB, path.join(dir, 'none'), '/a'))).toBe('TRN-HDC-REMOTE-PATH');
  });

  it('fport add / ls / rm and busy ports', async () => {
    const { t } = setup({ faults: { busyPorts: ['tcp:16000'] } });
    const h = await t.forward(USB, 15001, 5001);
    expect(await t.listForwards()).toEqual([
      { key: USB, local: 'tcp:15001', remote: 'tcp:5001', direction: 'forward' },
    ]);
    expect(await code(t.forward(USB, 15001, 5001))).toBe('TRN-HDC-FPORT');
    expect(await code(t.forward(USB, 16000, 5001))).toBe('TRN-HDC-FPORT');
    await h.remove();
    await h.remove(); // idempotent
    expect(await t.listForwards()).toEqual([]);
    expect(await code(t.forward(USB, 0, 5001))).toBe('TRN-HDC-FPORT');
  });

  it('fport rm failure surfaces', async () => {
    const { t, m } = setup();
    const h = await t.forward(USB, 15002, 5001);
    // remove behind the handle's back
    const t2 = new HdcTransport({ hdcPath: m.hdcPath, runner, env: m.env });
    await (
      await t2.listForwards()
    ).length;
    await runner.run({ ...t2.command(['fport', 'rm', 'tcp:15002', 'tcp:5001']), env: m.env });
    expect(await code(h.remove())).toBe('TRN-HDC-FPORT');
  });

  it('times out hung commands (TRN-HDC-TIMEOUT) with retry for idempotent queries', async () => {
    const { t, m } = setup({ faults: { hang: ['list'] } }, { listMs: 400 });
    const started = Date.now();
    expect(await code(t.listTargets())).toBe('TRN-HDC-TIMEOUT');
    expect(Date.now() - started).toBeGreaterThanOrEqual(700); // 1 retry
    expect(m.calls().length).toBe(0); // hung calls never persisted state
  });

  it('cancels (TRN-HDC-CANCELLED)', async () => {
    const { t } = setup({ faults: { hang: ['shell'] } });
    const cts = new CancellationTokenSource();
    const p = t.shell(USB, 'sleep', { token: cts.token });
    setTimeout(() => cts.cancel(), 200);
    expect(await code(p)).toBe('TRN-HDC-CANCELLED');
  });

  it('hdc server problems and unknown commands', async () => {
    const { t } = setup({ faults: { serverDown: true } });
    expect(await code(t.listTargets())).toBe('TRN-HDC-SERVER');
    const { t: t2 } = setup({ faults: { raw: { tconn: '[Fail][E001001]Unknown command' } } });
    expect(await code(t2.connect('1.2.3.4:8710'))).toBe('TRN-HDC-UNKNOWN-COMMAND');
  });

  it('decodes GBK output from hdc on Chinese Windows', async () => {
    // "[Fail]连接失败" encoded in GBK
    const hex = Buffer.concat([
      Buffer.from('[Fail]'),
      Buffer.from([0xc1, 0xac, 0xbd, 0xd3, 0xca, 0xa7, 0xb0, 0xdc]),
    ]).toString('hex');
    const { t } = setup({ outputEncoding: 'gbk-hex', faults: { raw: { tconn: hex } } });
    const e = await t.connect('1.2.3.4:8710').catch((x: unknown) => x);
    expect(isOhjsError(e)).toBe(true);
    expect((e as Error).message).toBe('连接失败');
  });

  it('missing hdc binary → ENV-HDC-NOT-FOUND', async () => {
    const t = new HdcTransport({ hdcPath: '/no/such/hdc', runner });
    expect(await code(t.listTargets())).toBe('ENV-HDC-NOT-FOUND');
  });

  it('passes through unexpected runner errors', async () => {
    const boom = new Error('boom');
    const fake: IProcessRunner = {
      run: () => Promise.reject(boom),
      spawnStream: () => {
        throw boom;
      },
      disposeAll: async () => undefined,
    };
    const t = new HdcTransport({ hdcPath: 'hdc', runner: fake, retries: 0 });
    await expect(t.listTargets()).rejects.toBe(boom);
  });

  it('streams shell output (log pull)', async () => {
    const { t } = setup({
      shell: [{ match: '^hilogcat', stdout: '01-01 00:00:00.000 1 1 I A0/ACE: hello' }],
    });
    const s = t.shellStream(USB, 'hilogcat -L I');
    const chunks: string[] = [];
    s.onStdout((c) => chunks.push(c));
    await s.exited;
    expect(chunks.join('')).toContain('ACE: hello');
  });

  it('isTransportError', () => {
    expect(isTransportError(new Error('x'))).toBe(false);
  });
});
