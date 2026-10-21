/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ConnState, ConnType, DeviceInfo } from '@ohjs/core';
import { EMPTY_ECHO, MESSAGE_FAIL, lines } from './common';

const CONN_TYPES: readonly ConnType[] = ['USB', 'TCP', 'UART', 'BT', 'UNKNOWN'];
const STATES: readonly ConnState[] = ['Connected', 'Ready', 'Offline', 'Unauthorized', 'Unknown'];

/**
 * Parses `hdc list targets [-v]`.
 * Source format (host/server.cpp BuildDaemonVisableLine):
 *  -v:  "%s\t\t%s\t%s\t%s\n" = key, USB|TCP|UART|BT|UNKNOWN, Connected|Ready|Offline|Unauthorized|Unknown, devname
 *  plain: "%s[\tUnauthorized]\n" (only connected targets)
 *  none: "[Empty]"
 */
export function parseTargets(output: string): DeviceInfo[] {
  const out: DeviceInfo[] = [];
  for (const line of lines(output)) {
    const t = line.trim();
    if (t === EMPTY_ECHO || t.startsWith(MESSAGE_FAIL) || t.startsWith('[')) continue;
    const cols = t.split(/\t+/).map((c) => c.trim());
    const key = cols[0]!;
    if (cols.length >= 3 && CONN_TYPES.includes(cols[1] as ConnType)) {
      const state = STATES.includes(cols[2] as ConnState) ? (cols[2] as ConnState) : 'Unknown';
      const name = cols.slice(3).join(' ');
      out.push({
        key,
        connType: cols[1] as ConnType,
        state,
        name: name && name !== 'unknown...' ? name : undefined,
      });
    } else {
      const unauthorized = cols[1] === 'Unauthorized';
      out.push({ key, connType: guessConnType(key), state: unauthorized ? 'Unauthorized' : 'Connected' });
    }
  }
  return out;
}

/** ip:port keys are TCP; everything else is treated as USB serial. */
export function guessConnType(key: string): ConnType {
  return /^(\d{1,3}\.){3}\d{1,3}:\d+$/.test(key) || /^\[[0-9a-f:]+\]:\d+$/i.test(key) ? 'TCP' : 'USB';
}
