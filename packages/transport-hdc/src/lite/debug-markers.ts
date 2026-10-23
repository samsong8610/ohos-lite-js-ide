/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Device-side debugger handshake markers (cleared before deploy and on failure). */
export const DEFAULT_DEBUG_MARKER_DIR = '/data/ohjs';

export function debugMarkerRemotePath(bundle: string, dir = DEFAULT_DEBUG_MARKER_DIR): string {
  return `${dir.replace(/\/$/, '')}/debug.${bundle}`;
}

/** Create `/data/ohjs/debug.<bundle>` before `aa start` (device waits for IDE). */
export function shellCreateDebugMarker(bundle: string, dir = DEFAULT_DEBUG_MARKER_DIR): string {
  const file = debugMarkerRemotePath(bundle, dir);
  const base = dir.replace(/\/$/, '');
  return `mkdir -p ${base} && touch ${file}`;
}

export function shellClearDebugMarkers(dir = DEFAULT_DEBUG_MARKER_DIR): string {
  return `rm -f ${dir}/debug.*`;
}
