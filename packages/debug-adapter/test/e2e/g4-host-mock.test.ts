/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * G4 host gate: mock-hdc tconn → Jerry launch contract → breakpoint / pause / continue on mock engine.
 * Invoked by `pnpm run smoke:g4-mock` (no real board, no USB).
 */
import * as fs from 'fs';
import * as path from 'path';
import { DeviceProfileRegistry, NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { findConfigJson, parseFaConfigJson } from '@ohjs/build';
import { JerryDebugClient, ClientMsg, ServerMsg } from '@ohjs/jerry-debug-client';
import { MockJerrySocket } from '../../../jerry-debug-client/src/mock-socket.test-helper';
import { createMockHdc } from '@ohjs/test-kit';
import { HdcTransport, LiteDeployService } from '@ohjs/transport-hdc';
import { launchJerryOnDevice, teardownJerryOnDevice } from '../../src/device-lifecycle.js';
import { afterEach, describe, expect, it } from 'vitest';

const TCONN = process.env.G4_MOCK_TCONN ?? '127.0.0.1:8720';
const LOCAL_PORT = Number(process.env.G4_MOCK_LOCAL_PORT ?? '19041');

const fixtureRoot =
  process.env.OHJS_FIXTURE_ROOT ?? path.join(__dirname, '../../../extension/test/fixtures/oh-project');

const SAMPLE_SRC = [
  'function add(a, b) {',
  '  var s = a + b;',
  '  return s;',
  '}',
  'var x = add(4, 6);',
  'print("x=" + x);',
].join('\n');

function loadProfile() {
  const registry = new DeviceProfileRegistry();
  const json = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../../extension/device-profiles/2k0300-linux-1024x768.json'),
      'utf8',
    ),
  );
  registry.add(json, 'builtin');
  return registry.resolve(json.id);
}

function parseSample(s: MockJerrySocket, name = 'pages/index/index.js'): void {
  s.str(ServerMsg.SOURCE_CODE, ServerMsg.SOURCE_CODE_END, Buffer.from(SAMPLE_SRC));
  s.str(ServerMsg.SOURCE_CODE_NAME, ServerMsg.SOURCE_CODE_NAME_END, Buffer.from(name), 4);
  s.msg(ServerMsg.FUNCTION_NAME_END, Buffer.from('add'));
  s.msg(ServerMsg.PARSE_FUNCTION, s.u32(1, 1));
  s.msg(ServerMsg.BREAKPOINT_LIST, s.u32(2, 3));
  s.msg(ServerMsg.BREAKPOINT_OFFSET_LIST, s.u32(10, 20));
  s.msg(ServerMsg.BYTE_CODE_CP, s.cp(0x20));
  s.msg(ServerMsg.BREAKPOINT_LIST, s.u32(1, 5, 6));
  s.msg(ServerMsg.BREAKPOINT_OFFSET_LIST, s.u32(4, 30, 40));
  s.msg(ServerMsg.BYTE_CODE_CP, s.cp(0x10));
}

function hit(s: MockJerrySocket, cp: number, off: number, type = ServerMsg.BREAKPOINT_HIT): void {
  s.msg(type, Buffer.concat([s.cp(cp), s.u32(off)]));
}

describe('G4 host smoke (mock-hdc + mock Jerry)', () => {
  let mock: ReturnType<typeof createMockHdc>;
  let runner: NodeProcessRunner;
  let engine: MockJerrySocket | undefined;

  afterEach(async () => {
    engine?.destroy();
    engine = undefined;
    mock?.dispose();
    runner?.disposeAll();
  });

  it('tconn → marker / aa start / fport → breakpoint → pause → continue', async () => {
    mock = createMockHdc({
      version: '3.2.0c',
      reachable: [TCONN],
    });
    const platform = createHostPlatform();
    runner = new NodeProcessRunner(platform);
    const transport = new HdcTransport({
      hdcPath: mock.hdcPath,
      runner,
      env: mock.env,
    });

    const cfg = findConfigJson(fixtureRoot);
    expect(cfg).toBeTruthy();
    const module = parseFaConfigJson(fs.readFileSync(cfg!, 'utf8'), cfg!);

    await transport.connect(TCONN);
    const profile = loadProfile();
    const deploy = new LiteDeployService({ transport, profile });

    const connect = async (opts: { host: string; port: number; timeoutMs?: number }) => {
      expect(opts.host).toBe('127.0.0.1');
      expect(opts.port).toBe(LOCAL_PORT);
      engine = new MockJerrySocket();
      const pending = JerryDebugClient.attach(engine, opts.timeoutMs ?? 15000);
      engine.handshake();
      engine.msg(ServerMsg.CONFIGURATION, engine.config(9, 64));
      return pending;
    };

    const { client, forward } = await launchJerryOnDevice(
      { transport, deploy, connect },
      {
        target: TCONN,
        bundle: module.bundleName,
        ability: module.abilityName,
        localPort: LOCAL_PORT,
        remoteDebugPort: profile.debug.port,
      },
    );

    expect(engine).toBeDefined();
    parseSample(engine!);
    hit(engine!, 0x10, 4);
    await new Promise<void>((resolve) => {
      if (client.stopped) resolve();
      else client.once('stopped', () => resolve());
    });
    expect(client.stopped).toBe(true);
    expect(client.location?.line).toBe(1);

    const bp = client.setBreakpoint('pages/index/index.js', 2);
    expect(bp.verified).toBe(true);
    engine!.take();

    const resumed = new Promise<boolean>((resolve) => client.once('resumed', () => resolve(true)));
    client.continue();
    expect(await resumed).toBe(true);
    expect(engine!.take()).toEqual([{ type: ClientMsg.CONTINUE, data: Buffer.alloc(0) }]);

    const atBp = new Promise<void>((resolve) => client.once('stopped', () => resolve()));
    hit(engine!, 0x20, 10);
    await atBp;
    expect(client.location?.line).toBe(2);

    const running = new Promise<boolean>((resolve) => client.once('resumed', () => resolve(true)));
    client.continue();
    expect(await running).toBe(true);
    engine!.take();

    client.pause();
    expect(engine!.take().map((m) => m.type)).toEqual([ClientMsg.STOP]);

    const paused = new Promise<void>((resolve) => client.once('stopped', () => resolve()));
    hit(engine!, 0x20, 20);
    await paused;
    expect(client.stopped).toBe(true);

    const resumed2 = new Promise<boolean>((resolve) => client.once('resumed', () => resolve(true)));
    client.continue();
    expect(await resumed2).toBe(true);

    const joined = mock
      .calls()
      .map((a) => a.join(' '))
      .join('\n');
    expect(joined).toMatch(/tconn/);
    expect(joined).toMatch(/debug\.com\.example\.ohjs\.smoke/);
    expect(joined).toMatch(/aa start/);
    expect(joined).toMatch(new RegExp(`fport tcp:${LOCAL_PORT} tcp:${profile.debug.port}`));
    expect(joined).toMatch(/rm -f \/data\/ohjs\/debug\.\*/);

    await teardownJerryOnDevice({ deploy }, TCONN, client, forward);
    expect(
      mock
        .calls()
        .map((a) => a.join(' '))
        .some((s) => s.includes('fport') && s.includes('rm')),
    ).toBe(true);
  });
});
