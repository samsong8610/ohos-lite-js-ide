/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** bm/aa on OpenHarmony lite always exit 0; success/failure is read from stdout text. */

export type BmSetDisableResult = 'debug' | 'release';

export function parseBmSetDisableOutput(output: string): BmSetDisableResult {
  return /\bsuccess\b/i.test(output) ? 'debug' : 'release';
}

export function parseBmInstallOutput(output: string): { ok: true } | { ok: false; message: string } {
  if (/resultMessage is install success\s*!/i.test(output)) return { ok: true };
  const m = /resultMessage is (ERR_[^\s!]+)/i.exec(output);
  if (m) return { ok: false, message: m[1]! };
  if (/resultMessage is/i.test(output)) return { ok: false, message: output.trim() };
  return { ok: false, message: output.trim() || 'bm install produced no resultMessage' };
}

export function parseBmUninstallOutput(output: string): { ok: true } | { ok: false; message: string } {
  if (/resultMessage is uninstall success\s*!/i.test(output)) return { ok: true };
  const m = /resultMessage is (ERR_[^\s!]+)/i.exec(output);
  if (m) return { ok: false, message: m[1]! };
  return { ok: false, message: output.trim() || 'bm uninstall failed' };
}

export function parseAaStartOutput(output: string): { ok: true } | { ok: false; message: string } {
  if (/Failed to run the command\./i.test(output)) {
    return { ok: false, message: 'Failed to run the command.' };
  }
  return { ok: true };
}

export function parseAaTerminateOutput(_output: string): { ok: true } {
  return { ok: true };
}
