/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { CancellationTokenSource, NoneCancellationToken } from './cancellation';
import { OhjsError, isOhjsError } from './errors';

describe('OhjsError', () => {
  it('keeps code, detail and cause', () => {
    const cause = new Error('x');
    const e = new OhjsError('TRN-HDC-FAILED', 'boom', { raw: 'out', exitCode: 1 }, cause);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('OhjsError');
    expect(e.code).toBe('TRN-HDC-FAILED');
    expect(e.detail.raw).toBe('out');
    expect(e.cause).toBe(cause);
    expect(isOhjsError(e)).toBe(true);
    expect(isOhjsError(e, 'TRN-HDC-FAILED')).toBe(true);
    expect(isOhjsError(e, 'PROC-TIMEOUT')).toBe(false);
    expect(isOhjsError(new Error('x'))).toBe(false);
    expect(new OhjsError('PROC-TIMEOUT', 'm').detail).toEqual({});
  });
});

describe('CancellationTokenSource', () => {
  it('fires listeners once and reports state', () => {
    const s = new CancellationTokenSource();
    let n = 0;
    const d = s.token.onCancellationRequested(() => n++);
    const d2 = s.token.onCancellationRequested(() => (n += 10));
    d2.dispose();
    expect(s.token.isCancellationRequested).toBe(false);
    s.cancel();
    s.cancel();
    expect(n).toBe(1);
    expect(s.token.isCancellationRequested).toBe(true);
    d.dispose();
    // late subscription fires immediately
    s.token.onCancellationRequested(() => (n += 100)).dispose();
    expect(n).toBe(101);
    s.dispose();
  });
  it('None token never cancels', () => {
    expect(NoneCancellationToken.isCancellationRequested).toBe(false);
    NoneCancellationToken.onCancellationRequested(() => undefined).dispose();
  });
});
