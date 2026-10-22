/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeHdcToolchainOhVersion,
  ohVersionDirName,
  parseDeviceOhVersionText,
  parseProjectToolchainJson,
} from './oh-version';

describe('oh-version (hdc toolchain)', () => {
  it('maps major/minor to bundled toolchain ids', () => {
    expect(normalizeHdcToolchainOhVersion('5.0.3')).toBe('5.0.3');
    expect(normalizeHdcToolchainOhVersion('6.1-lts')).toBe('6.1-LTS');
    expect(normalizeHdcToolchainOhVersion('OpenHarmony 6.1.0')).toBe('6.1-LTS');
    expect(normalizeHdcToolchainOhVersion('5.0.2')).toBe('5.0.3');
    expect(normalizeHdcToolchainOhVersion('4.1')).toBeUndefined();
  });

  it('parses param output and runtime manifest JSON', () => {
    expect(parseDeviceOhVersionText('OpenHarmony-5.0.3\r\n')).toBe('5.0.3');
    expect(parseDeviceOhVersionText('6.1.0.123')).toBe('6.1-LTS');
    expect(parseDeviceOhVersionText('{"ohVersion":"6.1-LTS","board":"2k0300"}')).toBe('6.1-LTS');
  });

  it('versionDirName matches schema packs', () => {
    expect(ohVersionDirName('5.0.3')).toBe('v5.0.3');
    expect(ohVersionDirName('6.1-LTS')).toBe('v6.1-lts');
  });

  it('reads .ohjs/toolchain.json', () => {
    expect(parseProjectToolchainJson('{"hdc":"/x/hdc","ohVersion":"5.0.3"}')).toEqual({
      hdc: '/x/hdc',
      ohVersion: '5.0.3',
    });
    expect(parseProjectToolchainJson('{')).toBeUndefined();
  });
});
