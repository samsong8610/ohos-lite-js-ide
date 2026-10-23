/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Minimal WebSocket framing exactly as jerry-ext/debugger/debugger-ws.c expects:
 * fixed client handshake, binary FIN frames, payload < 126 bytes, client frames masked with a zero key.
 */

export const HANDSHAKE_REQUEST =
  'GET /jerry-debugger HTTP/1.1\r\n' +
  'Upgrade: websocket\r\n' +
  'Connection: Upgrade\r\n' +
  'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n';

export const HANDSHAKE_RESPONSE =
  'HTTP/1.1 101 Switching Protocols\r\n' +
  'Upgrade: websocket\r\n' +
  'Connection: Upgrade\r\n' +
  'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n';

export const WS_BINARY_FIN = 0x82;
export const WS_MASK_BIT = 0x80;
export const WS_MAX_PAYLOAD = 125;

/** Encode one client→server message (payload = [type, ...data]) as a masked frame with a zero mask. */
export function encodeClientFrame(payload: Uint8Array): Buffer {
  if (payload.length === 0 || payload.length > WS_MAX_PAYLOAD) {
    throw new RangeError(`jerry ws payload must be 1..${WS_MAX_PAYLOAD} bytes, got ${payload.length}`);
  }
  const frame = Buffer.alloc(6 + payload.length);
  frame[0] = WS_BINARY_FIN;
  frame[1] = WS_MASK_BIT | payload.length;
  // bytes 2..5: mask key = 0 (XOR with 0 is identity), as the reference client does
  frame.set(payload, 6);
  return frame;
}

export class FrameError extends Error {}

/**
 * Incremental decoder for the server side. Call {@link push} with socket data; it returns complete payloads.
 * Before the handshake completes, bytes are matched against {@link HANDSHAKE_RESPONSE}.
 */
export class WsDecoder {
  private buf: Buffer = Buffer.alloc(0);
  private handshakeDone = false;

  get isOpen(): boolean {
    return this.handshakeDone;
  }

  push(chunk: Uint8Array): Buffer[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const out: Buffer[] = [];
    if (!this.handshakeDone) {
      const want = Buffer.from(HANDSHAKE_RESPONSE, 'latin1');
      const n = Math.min(this.buf.length, want.length);
      if (!this.buf.subarray(0, n).equals(want.subarray(0, n))) {
        throw new FrameError('Unexpected WebSocket handshake response from jerry debugger');
      }
      if (this.buf.length < want.length) return out;
      this.buf = this.buf.subarray(want.length);
      this.handshakeDone = true;
    }
    while (this.buf.length >= 2) {
      if (this.buf[0] !== WS_BINARY_FIN) {
        throw new FrameError(`Unexpected WebSocket frame header 0x${(this.buf[0] ?? 0).toString(16)}`);
      }
      const size = this.buf[1] ?? 0;
      if (size === 0 || size >= 126) throw new FrameError(`Unexpected WebSocket frame size ${size}`);
      if (this.buf.length < size + 2) break;
      out.push(Buffer.from(this.buf.subarray(2, size + 2)));
      this.buf = this.buf.subarray(size + 2);
    }
    return out;
  }
}
