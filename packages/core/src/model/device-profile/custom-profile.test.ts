/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { CUSTOM_PROFILE_ID, customProfileJson, mergeProjectDeviceTarget, validateDisplaySize } from './index';
import { isOhjsError } from '../../errors';

describe('validateDisplaySize', () => {
  it('accepts sensible pixel sizes', () => {
    expect(validateDisplaySize({ width: 800, height: 480 }).ok).toBe(true);
    expect(validateDisplaySize({ width: 1024, height: 600 }).ok).toBe(true);
  });
  it('rejects zero, fractions and out-of-range values', () => {
    expect(validateDisplaySize({ width: 0, height: 480 }).ok).toBe(false);
    expect(validateDisplaySize({ width: 800.5, height: 480 }).ok).toBe(false);
    expect(validateDisplaySize({ width: 800, height: 10000 }).message).toMatch(/Height/);
  });
});

describe('customProfileJson', () => {
  it('extends the base profile and overrides the display', () => {
    const p = JSON.parse(customProfileJson('cp2a070-la401', { width: 800, height: 480 }));
    expect(p).toEqual({
      id: CUSTOM_PROFILE_ID,
      extends: 'cp2a070-la401',
      name: 'Custom 800×480',
      display: { width: 800, height: 480 },
    });
  });
});

describe('mergeProjectDeviceTarget', () => {
  it('creates project.json when absent', () => {
    const p = JSON.parse(mergeProjectDeviceTarget(undefined, CUSTOM_PROFILE_ID));
    expect(p).toEqual({ defaultDeviceProfile: 'custom', deviceProfiles: ['custom'] });
  });
  it('keeps other fields and puts the selected profile first', () => {
    const raw = JSON.stringify({
      sdkVersion: '6.1-lts',
      module: 'entry',
      defaultDeviceProfile: 'cp2a070-la401',
      deviceProfiles: ['cp2a070-la401'],
    });
    const p = JSON.parse(mergeProjectDeviceTarget(raw, 'cp2a101-la401'));
    expect(p).toMatchObject({
      sdkVersion: '6.1-lts',
      module: 'entry',
      defaultDeviceProfile: 'cp2a101-la401',
    });
    expect(p.deviceProfiles).toEqual(['cp2a101-la401', 'cp2a070-la401']);
  });
  it('rejects invalid JSON', () => {
    try {
      mergeProjectDeviceTarget('{ nope', 'x');
      expect.unreachable();
    } catch (e) {
      expect(isOhjsError(e, 'PRJ-SCAFFOLD-FAILED')).toBe(true);
    }
  });
});
