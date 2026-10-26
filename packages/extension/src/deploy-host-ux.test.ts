/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OhjsError } from '@ohjs/core';
import { describe, expect, it } from 'vitest';
import { depNoTargetHint, formatOhjsHostError } from './deploy-host-ux';

describe('formatOhjsHostError', () => {
  it('includes hint in log and toast for OhjsError', () => {
    const e = new OhjsError('DEP-INSTALL-FAILED', 'sign fail', { hint: 'Use debug firmware' });
    expect(formatOhjsHostError(e)).toEqual({
      log: '[DEP-INSTALL-FAILED] sign fail\nHint: Use debug firmware',
      toast: '[DEP-INSTALL-FAILED] sign fail — Use debug firmware',
    });
  });

  it('passes through plain Error', () => {
    expect(formatOhjsHostError(new Error('boom'))).toEqual({ log: 'boom', toast: 'boom' });
  });
});

describe('depNoTargetHint', () => {
  it('mentions configured key when set', () => {
    expect(depNoTargetHint('10.0.0.1:8710')).toMatch(/10\.0\.0\.1:8710/);
  });
  it('default mentions refresh and tconn', () => {
    expect(depNoTargetHint()).toMatch(/Refresh Devices/);
    expect(depNoTargetHint()).toMatch(/tconn/);
  });
});
