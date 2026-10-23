/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** hdc shell does not reliably propagate exit codes; append an rc marker and strip it again (G2 / hdcd 3.2.0c). */
export const RC_MARKER = '__RC=';

export function wrapWithRc(cmd: string): string {
  return `${cmd}; echo ${RC_MARKER}$?`;
}

export function parseShellOutput(output: string): { output: string; exitCode: number | null } {
  const normalized = output.replace(/\r\n/g, '\n');
  const re = new RegExp(`(?:^|\\n)${RC_MARKER}(\\d+)\\s*$`);
  const m = re.exec(normalized);
  if (!m) return { output: normalized, exitCode: null };
  return {
    output: normalized.slice(0, m.index + (normalized[m.index] === '\n' ? 1 : 0)),
    exitCode: Number(m[1]),
  };
}
