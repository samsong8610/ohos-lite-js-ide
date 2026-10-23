/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { shellStartLogCapture, shellStopLogCapture, defaultLogCapturePaths } from './log-capture';

describe('log capture shell snippets', () => {
  it('uses pid file lifecycle', () => {
    const p = defaultLogCapturePaths('/tmp/ohjs');
    expect(shellStartLogCapture(p)).toContain('hilogcat > /tmp/ohjs/hilog.cap &');
    expect(shellStopLogCapture(p)).toContain('hilogcat.pid');
  });
});
