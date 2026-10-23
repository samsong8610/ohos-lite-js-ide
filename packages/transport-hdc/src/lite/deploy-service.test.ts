/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DeviceProfileRegistry, NodeProcessRunner, OhjsError, createHostPlatform } from '@ohjs/core';
import { createMockHdc } from '@ohjs/test-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { HdcTransport } from '../hdc-transport';
import { LiteDeployService } from './deploy-service';

const USB = '7001005458323933328a01ab';

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

describe('LiteDeployService (mock-hdc)', () => {
  let mock: ReturnType<typeof createMockHdc>;

  afterEach(() => {
    mock?.dispose();
  });

  it('deploy, install, start happy path', async () => {
    mock = createMockHdc({
      version: '3.2.0c',
      targets: [{ key: USB, connType: 'USB', state: 'Connected' }],
    });
    const platform = createHostPlatform();
    const runner = new NodeProcessRunner(platform);
    const transport = new HdcTransport({
      hdcPath: mock.hdcPath,
      runner,
      env: mock.env,
    });
    const profile = loadProfile();
    const svc = new LiteDeployService({ transport, profile });

    const hap = path.join(os.tmpdir(), `ohjs-${Date.now()}.hap`);
    fs.writeFileSync(hap, 'fake-hap');

    const pre = await svc.preflightDebugFirmware(USB);
    expect(pre.firmware).toBe('debug');

    const { remotePath } = await svc.deployHap(USB, hap);
    expect(remotePath).toBe('/tmp/ohjs/app.hap');
    expect(fs.existsSync(mock.devicePath(USB, remotePath))).toBe(true);

    await svc.install(USB, remotePath);
    await svc.startApp(USB, { bundle: 'com.example.app', ability: 'default' });

    fs.unlinkSync(hap);
    runner.disposeAll();
  });

  it('install failure clears debug markers and throws DEP-INSTALL-FAILED', async () => {
    mock = createMockHdc({
      targets: [{ key: USB, state: 'Connected' }],
      shell: [{ match: '^bm install', stdout: 'resultMessage is ERR_SIGN_FAIL' }],
    });
    const runner = new NodeProcessRunner(createHostPlatform());
    const transport = new HdcTransport({ hdcPath: mock.hdcPath, runner, env: mock.env });
    const svc = new LiteDeployService({ transport, profile: loadProfile() });
    const hap = path.join(os.tmpdir(), `ohjs-${Date.now()}.hap`);
    fs.writeFileSync(hap, 'x');
    await svc.deployHap(USB, hap);
    await expect(svc.install(USB, '/tmp/ohjs/app.hap')).rejects.toMatchObject({
      code: 'DEP-INSTALL-FAILED',
    });
    fs.unlinkSync(hap);
    runner.disposeAll();
  });

  it('rejects non-.hap deploy path', async () => {
    mock = createMockHdc({ targets: [{ key: USB, state: 'Connected' }] });
    const runner = new NodeProcessRunner(createHostPlatform());
    const svc = new LiteDeployService({
      transport: new HdcTransport({ hdcPath: mock.hdcPath, runner, env: mock.env }),
      profile: loadProfile(),
    });
    await expect(svc.deployHap(USB, '/tmp/nope.bin')).rejects.toBeInstanceOf(OhjsError);
    runner.disposeAll();
  });
});
