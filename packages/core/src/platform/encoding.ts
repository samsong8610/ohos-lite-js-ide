/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { TextDecoder } from 'util';
import type { OutputEncoding } from './types';

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8Lenient = new TextDecoder('utf-8');
let gbk: TextDecoder | undefined;

function gbkDecoder(): TextDecoder {
  // Node official builds ship full ICU, which includes GBK.
  gbk ??= new TextDecoder('gbk');
  return gbk;
}

/** Decodes tool output (hdc may print GBK on Chinese Windows, ARCHITECTURE §5.1). */
export function decodeOutput(bytes: Uint8Array, encoding: OutputEncoding = 'auto'): string {
  if (bytes.length === 0) return '';
  if (encoding === 'utf8') return utf8Lenient.decode(bytes);
  if (encoding === 'gbk') return gbkDecoder().decode(bytes);
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return gbkDecoder().decode(bytes);
  }
}
