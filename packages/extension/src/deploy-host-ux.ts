/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { RESTOOL_MISSING_HINT } from '@ohjs/build';
import { isOhjsError } from '@ohjs/core';

/** User-facing log line + toast text for deploy / log / build host commands. */
export function formatOhjsHostError(e: unknown): { log: string; toast: string } {
  if (!isOhjsError(e)) {
    const msg = (e as Error).message ?? String(e);
    return { log: msg, toast: msg };
  }
  const base = `[${e.code}] ${e.message}`;
  let hint = e.detail.hint;
  if (isOhjsError(e, 'BLD-TOOL-MISSING') && e.message.toLowerCase().includes('restool')) {
    hint = RESTOOL_MISSING_HINT;
  }
  const log = hint ? `${base}\nHint: ${hint}` : base;
  if (isOhjsError(e, 'BLD-TOOL-MISSING') && e.message.toLowerCase().includes('restool')) {
    return {
      log,
      toast: `OHJS build: restool is missing. ${RESTOOL_MISSING_HINT}`,
    };
  }
  const toast = hint ? `${base} — ${hint}` : base;
  return { log, toast };
}

export const DEP_NO_TARGET_HINT =
  'Run OHJS: Refresh Devices. With mock hdc, set ohjs.tools.hdcPath and run `hdc tconn <ip>:8710` when no USB device is listed.';

export function depNoTargetHint(configuredKey?: string): string {
  if (configuredKey?.trim()) {
    return `Configured target "${configuredKey.trim()}" is not connected. Run OHJS: Refresh Devices or hdc tconn <ip>:8710.`;
  }
  return DEP_NO_TARGET_HINT;
}
