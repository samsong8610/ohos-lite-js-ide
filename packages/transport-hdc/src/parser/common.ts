/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Message markers from developtools_hdc src/common/define.h (5.0.3 and 6.1-LTS identical).
export const MESSAGE_FAIL = '[Fail]';
export const MESSAGE_INFO = '[Info]';
export const EMPTY_ECHO = '[Empty]';

/** Splits hdc output (server echoes end with \r\n) into trimmed non-empty lines. */
export function lines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, '').trimEnd())
    .filter((l) => l.trim().length > 0);
}
