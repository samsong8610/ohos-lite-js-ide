/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { formatHilogEntry, parseHilogLine } from './hilog-parse';

describe('parseHilogLine', () => {
  it('parses standard lite format', () => {
    const line = '10-23 12:01:02.345 1234 5678 I A0/ACE: hello world';
    expect(parseHilogLine(line)).toMatchObject({
      monthDay: '10-23',
      time: '12:01:02.345',
      pid: '1234',
      taskId: '5678',
      level: 'I',
      domain: 'A0',
      tag: 'ACE',
      message: 'hello world',
    });
    expect(formatHilogEntry(parseHilogLine(line))).toBe(line);
  });

  it('returns raw for non-matching lines', () => {
    expect(parseHilogLine('garbage')).toEqual({ raw: 'garbage' });
  });
});
