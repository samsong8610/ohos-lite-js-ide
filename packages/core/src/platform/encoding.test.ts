/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { decodeOutput } from './encoding';

const gbkNiHao = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]); // 你好 in GBK
const utf8NiHao = new Uint8Array(Buffer.from('你好', 'utf8'));

describe('decodeOutput', () => {
  it('auto: utf8 first, GBK fallback', () => {
    expect(decodeOutput(utf8NiHao)).toBe('你好');
    expect(decodeOutput(gbkNiHao)).toBe('你好');
  });
  it('forced encodings', () => {
    expect(decodeOutput(gbkNiHao, 'gbk')).toBe('你好');
    expect(decodeOutput(utf8NiHao, 'utf8')).toBe('你好');
    expect(decodeOutput(gbkNiHao, 'utf8')).toContain('\ufffd');
  });
  it('empty', () => expect(decodeOutput(new Uint8Array())).toBe(''));
});
