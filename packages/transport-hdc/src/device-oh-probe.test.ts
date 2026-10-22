/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { createMockHdc, type MockHdc } from '@ohjs/test-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { probeDeviceOhVersion } from './device-oh-probe';
import { HdcTransport } from './hdc-transport';

const runner = new NodeProcessRunner(createHostPlatform());
const mocks: MockHdc[] = [];
afterEach(() => mocks.splice(0).forEach((m) => m.dispose()));

describe('probeDeviceOhVersion', () => {
  it('reads runtime manifest then param keys', async () => {
    const m = createMockHdc({
      targets: [{ key: 't1' }],
      shell: [
        {
          match: "cat '/etc/ohjs/runtime-manifest.json'",
          stdout: '{"ohVersion":"6.1-LTS"}\r\n',
        },
      ],
    });
    mocks.push(m);
    const t = new HdcTransport({ hdcPath: m.hdcPath, runner, env: m.env });
    expect(await probeDeviceOhVersion(t, 't1', { firmwareManifestPath: '/etc/ohjs/runtime-manifest.json' })).toBe(
      '6.1-LTS',
    );
  });

  it('falls back to param get', async () => {
    const m = createMockHdc({
      targets: [{ key: 't1' }],
      shell: [{ match: 'param get const.product.software.version', stdout: '5.0.3.123\r\n' }],
    });
    mocks.push(m);
    const t = new HdcTransport({ hdcPath: m.hdcPath, runner, env: m.env });
    expect(await probeDeviceOhVersion(t, 't1')).toBe('5.0.3');
  });
});
