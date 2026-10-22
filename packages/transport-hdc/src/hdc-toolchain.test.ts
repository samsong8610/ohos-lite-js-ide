/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostPlatform, NodeProcessRunner, ToolLocator, type DeviceInfo } from '@ohjs/core';
import { createMockHdc, type MockHdc } from '@ohjs/test-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { HdcToolchainResolver } from './hdc-toolchain';

const lin = new HostPlatform({ kind: 'linux', env: { PATH: '/usr/bin' }, homeDir: '/home/u' });
const runner = new NodeProcessRunner(lin);

afterEach(() => mocks.splice(0).forEach((m) => m.dispose()));
const mocks: MockHdc[] = [];

function stubHdc(ext: string, rel: string): string {
  const p = path.join(ext, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return p;
}

describe('HdcToolchainResolver', () => {
  it('re-locates to the 5.0.3 bundled hdc after probing the device', async () => {
    const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ext-'));
    const v503 = stubHdc(ext, 'bin/linux-x64/v5.0.3/hdc');
    const v61 = stubHdc(ext, 'bin/linux-x64/v6.1-lts/hdc');
    const locator = new ToolLocator(lin, (p) => p === v503 || p === v61);
    const resolver = new HdcToolchainResolver(lin, locator, async () => '5.0.3');

    const targets: DeviceInfo[] = [{ key: 'dev1', connType: 'USB', state: 'Connected' }];
    const r = await resolver.resolve(
      {
        fallbackOhVersion: '6.1-LTS',
        extensionDir: ext,
        runner,
      },
      targets,
    );
    expect(r.located.path).toBe(v503);
    expect(r.ohToolchain).toBe('5.0.3');
    expect(r.deviceOhVersion).toBe('5.0.3');
  });

  it('honours ohjs.tools.hdcPath without probing', async () => {
    const m = createMockHdc({ targets: [{ key: 'dev1' }] });
    mocks.push(m);
    let probed = false;
    const resolver = new HdcToolchainResolver(lin, undefined, async () => {
      probed = true;
      return '5.0.3';
    });
    const r = await resolver.resolve(
      {
        userHdcPath: m.hdcPath,
        fallbackOhVersion: '6.1-LTS',
        runner,
        env: m.env,
      },
      [{ key: 'dev1', connType: 'USB', state: 'Connected' }],
    );
    expect(r.located.path).toBe(m.hdcPath);
    expect(r.deviceOhVersion).toBeUndefined();
    expect(probed).toBe(false);
  });
});
