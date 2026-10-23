/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DeviceProfileRegistry, NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { createMockHdc } from '@ohjs/test-kit';
import type { JerryDebugClient } from '@ohjs/jerry-debug-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HdcTransport } from '@ohjs/transport-hdc';
import { LiteDeployService } from '@ohjs/transport-hdc';
import { launchJerryOnDevice, teardownJerryOnDevice } from './device-lifecycle.js';

const USB = '7001005458323933328a01ab';

function loadProfile() {
  const registry = new DeviceProfileRegistry();
  const json = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../extension/device-profiles/2k0300-linux-1024x768.json'),
      'utf8',
    ),
  );
  registry.add(json, 'builtin');
  return registry.resolve(json.id);
}

describe('launchJerryOnDevice lifecycle', () => {
  let mock: ReturnType<typeof createMockHdc>;

  afterEach(() => {
    mock?.dispose();
  });

  it('creates marker, starts app, forwards port, connects, then clears marker', async () => {
    mock = createMockHdc({
      version: '3.2.0c',
      targets: [{ key: USB, state: 'Connected' }],
    });
    const runner = new NodeProcessRunner(createHostPlatform());
    const transport = new HdcTransport({ hdcPath: mock.hdcPath, runner, env: mock.env });
    const deploy = new LiteDeployService({ transport, profile: loadProfile() });
    const fakeClient = { close: vi.fn() } as unknown as JerryDebugClient;
    const connect = vi.fn(async () => fakeClient);

    const r = await launchJerryOnDevice(
      { transport, deploy, connect },
      {
        target: USB,
        bundle: 'com.example.app',
        ability: 'default',
        localPort: 19001,
        remoteDebugPort: 5001,
      },
    );
    expect(r.client).toBe(fakeClient);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1', port: 19001 }));
    const shellCalls = mock
      .calls()
      .filter((c) => c[0] === 'shell' || (c.length > 2 && c[2] === 'shell'))
      .map((c) => c.join(' '));
    expect(shellCalls.some((s) => s.includes('debug.com.example.app'))).toBe(true);
    expect(shellCalls.some((s) => s.includes('rm -f /data/ohjs/debug.*'))).toBe(true);
    await teardownJerryOnDevice({ deploy }, USB, r.client, r.forward);
    runner.disposeAll();
  });

  it('clears markers and removes fport when connect fails', async () => {
    mock = createMockHdc({
      targets: [{ key: USB, state: 'Connected' }],
    });
    const runner = new NodeProcessRunner(createHostPlatform());
    const transport = new HdcTransport({ hdcPath: mock.hdcPath, runner, env: mock.env });
    const deploy = new LiteDeployService({ transport, profile: loadProfile() });
    const connect = vi.fn(async () => {
      throw new Error('handshake timeout');
    });

    await expect(
      launchJerryOnDevice(
        { transport, deploy, connect },
        {
          target: USB,
          bundle: 'com.example.app',
          ability: 'default',
          localPort: 19002,
          remoteDebugPort: 5001,
        },
      ),
    ).rejects.toThrow(/handshake timeout/);

    const joined = mock.calls().map((c) => c.join(' '));
    expect(joined.some((s) => s.includes('fport') && s.includes('rm'))).toBe(true);
    expect(joined.filter((s) => s.includes('rm -f /data/ohjs/debug.*')).length).toBeGreaterThanOrEqual(1);
    runner.disposeAll();
  });

  it('clears markers when aa start fails', async () => {
    mock = createMockHdc({
      targets: [{ key: USB, state: 'Connected' }],
      shell: [{ match: '^aa start', stdout: 'Failed to run the command.' }],
    });
    const runner = new NodeProcessRunner(createHostPlatform());
    const transport = new HdcTransport({ hdcPath: mock.hdcPath, runner, env: mock.env });
    const deploy = new LiteDeployService({ transport, profile: loadProfile() });

    await expect(
      launchJerryOnDevice(
        { transport, deploy, connect: vi.fn() },
        {
          target: USB,
          bundle: 'com.example.app',
          ability: 'default',
          localPort: 19003,
          remoteDebugPort: 5001,
        },
      ),
    ).rejects.toMatchObject({ code: 'DEP-START-FAILED' });
    expect(mock.calls().join(' ')).toMatch(/rm -f \/data\/ohjs\/debug\.\*/);
    runner.disposeAll();
  });
});
