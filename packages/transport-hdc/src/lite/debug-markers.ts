/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Device-side debugger handshake markers (cleared before deploy and on failure). */
export const DEFAULT_DEBUG_MARKER_DIR = '/data/ohjs';

export function shellClearDebugMarkers(dir = DEFAULT_DEBUG_MARKER_DIR): string {
  return `rm -f ${dir}/debug.*`;
}
