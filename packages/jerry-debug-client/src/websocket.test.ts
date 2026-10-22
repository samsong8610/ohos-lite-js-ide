/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { encodeClientFrame, FrameError, HANDSHAKE_RESPONSE, WsDecoder } from './websocket.js';

describe('websocket framing', () => {
  it('encodes masked client frames with zero key', () => {
    expect([...encodeClientFrame(Buffer.from([12]))]).toEqual([0x82, 0x81, 0, 0, 0, 0, 12]);
    expect(() => encodeClientFrame(Buffer.alloc(0))).toThrow(RangeError);
    expect(() => encodeClientFrame(Buffer.alloc(126))).toThrow(RangeError);
  });

  it('decodes handshake then frames incrementally', () => {
    const d = new WsDecoder();
    expect(d.isOpen).toBe(false);
    const hs = Buffer.from(HANDSHAKE_RESPONSE, 'latin1');
    expect(d.push(hs.subarray(0, 10))).toEqual([]);
    expect(d.push(Buffer.concat([hs.subarray(10), Buffer.from([0x82, 2, 1])]))).toEqual([]);
    expect(d.isOpen).toBe(true);
    expect(d.push(Buffer.from([2, 0x82, 1, 5]))).toEqual([Buffer.from([1, 2]), Buffer.from([5])]);
  });

  it('rejects bad sizes', () => {
    const d = new WsDecoder();
    d.push(Buffer.from(HANDSHAKE_RESPONSE, 'latin1'));
    expect(() => d.push(Buffer.from([0x82, 0]))).toThrow(FrameError);
    const d2 = new WsDecoder();
    d2.push(Buffer.from(HANDSHAKE_RESPONSE, 'latin1'));
    expect(() => d2.push(Buffer.from([0x82, 126]))).toThrow(/size 126/);
  });
});
