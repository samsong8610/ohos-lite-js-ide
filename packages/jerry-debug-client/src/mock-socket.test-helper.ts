/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Test-only helper (not exported from index). A fake jerry engine end of the socket.
import { EventEmitter } from 'node:events';
import { HANDSHAKE_REQUEST, HANDSHAKE_RESPONSE } from './websocket.js';
import type { JerrySocket } from './client.js';

export interface SentMessage {
  type: number;
  data: Buffer;
}

export class MockJerrySocket extends EventEmitter implements JerrySocket {
  readonly sent: SentMessage[] = [];
  handshakeSeen = false;
  destroyed = false;
  constructor(
    private readonly le = true,
    readonly cpSize = 2,
  ) {
    super();
  }

  write(data: Uint8Array): boolean {
    const b = Buffer.from(data);
    if (!this.handshakeSeen) {
      if (b.toString('latin1') !== HANDSHAKE_REQUEST) throw new Error('bad handshake');
      this.handshakeSeen = true;
      return true;
    }
    if (b[0] !== 0x82 || ((b[1] ?? 0) & 0x80) === 0) throw new Error('bad client frame');
    const len = (b[1] ?? 0) & 0x7f;
    if (b.length !== 6 + len || b.readUInt32BE(2) !== 0) throw new Error('bad client frame len/mask');
    this.sent.push({ type: b[6] ?? 0, data: b.subarray(7) });
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('close');
  }

  /** Deliver raw bytes to the client. */
  raw(b: Buffer): void {
    this.emit('data', b);
  }

  handshake(): void {
    this.raw(Buffer.from(HANDSHAKE_RESPONSE, 'latin1'));
  }

  frame(type: number, data: Buffer = Buffer.alloc(0)): Buffer {
    return Buffer.concat([Buffer.from([0x82, 1 + data.length, type]), data]);
  }

  msg(type: number, data: Buffer = Buffer.alloc(0)): void {
    this.raw(this.frame(type, data));
  }

  u32(...v: number[]): Buffer {
    const b = Buffer.alloc(4 * v.length);
    v.forEach((x, i) => (this.le ? b.writeUInt32LE(x, i * 4) : b.writeUInt32BE(x, i * 4)));
    return b;
  }

  cp(v: number): Buffer {
    if (this.cpSize === 4) return this.u32(v);
    const b = Buffer.alloc(2);
    if (this.le) b.writeUInt16LE(v);
    else b.writeUInt16BE(v);
    return b;
  }

  config(version = 9, maxMsg = 64): Buffer {
    const b = Buffer.alloc(7);
    b[0] = this.le ? 1 : 0;
    if (this.le) b.writeUInt32LE(version, 1);
    else b.writeUInt32BE(version, 1);
    b[5] = maxMsg;
    b[6] = this.cpSize;
    return b;
  }

  /** Server string message split into chunks of `chunk` bytes, last one using `endType`. */
  str(type: number, endType: number, s: Buffer, chunk = 20): void {
    let p = 0;
    while (s.length - p > chunk) {
      this.msg(type, s.subarray(p, p + chunk));
      p += chunk;
    }
    this.msg(endType, s.subarray(p));
  }

  take(): SentMessage[] {
    return this.sent.splice(0);
  }
}
