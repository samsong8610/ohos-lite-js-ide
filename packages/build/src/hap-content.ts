/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OhjsError } from '@ohjs/core';

/** JerryScript lite snapshot magic (`JRRY1\\0\\0\\0\\0`). */
export const JERRY_BC_MAGIC = Buffer.from('4a52525931000000', 'hex');

/** Restool index header prefix (`Restool `). */
export const RESTOOL_INDEX_MAGIC = Buffer.from('526573746f6f6c20', 'hex');

export const PNG_MAGIC = Buffer.from('89504e470d0a1a0a', 'hex');

export function bufferStartsWith(buf: Buffer, magic: Buffer): boolean {
  return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic);
}

export function assertJerryBytecode(buf: Buffer, label: string): void {
  if (!bufferStartsWith(buf, JERRY_BC_MAGIC)) {
    throw new OhjsError('BLD-FAILED', `${label}: missing Jerry lite snapshot magic JRRY1`, {
      hint: buf.subarray(0, 8).toString('hex'),
    });
  }
  if (buf.length < 32) {
    throw new OhjsError('BLD-FAILED', `${label}: Jerry bytecode shorter than minimum snapshot`, {
      hint: String(buf.length),
    });
  }
}

export function assertRestoolIndex(buf: Buffer, label: string): void {
  if (!bufferStartsWith(buf, RESTOOL_INDEX_MAGIC)) {
    throw new OhjsError('BLD-FAILED', `${label}: missing Restool index header`, {
      hint: buf.subarray(0, 16).toString('hex'),
    });
  }
  if (buf.length < 128) {
    throw new OhjsError('BLD-FAILED', `${label}: Restool index shorter than header block`, {
      hint: String(buf.length),
    });
  }
}

export function assertPng(buf: Buffer, label: string): void {
  if (!bufferStartsWith(buf, PNG_MAGIC)) {
    throw new OhjsError('BLD-FAILED', `${label}: not a PNG (expected 89504e47…)`, {
      hint: buf.subarray(0, 8).toString('hex'),
    });
  }
}

/** Normalize preview_css.json keys to basenames for cross-host comparison. */
export function normalizePreviewCssEntry(entry: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(entry)) {
    const base = k.replace(/\\/g, '/').split('/').pop() ?? k;
    if (typeof v === 'boolean') out[base] = v;
  }
  return out;
}
