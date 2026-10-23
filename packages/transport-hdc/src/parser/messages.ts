/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ErrorCode } from '@ohjs/core';
import { enrichHdcFailure } from '../ide-error-codes/match';
import { MESSAGE_FAIL, MESSAGE_INFO, lines } from './common';

export interface HdcFailure {
  code: ErrorCode;
  /** hdc's own error code such as E005102, when present */
  hdcCode?: string;
  message: string;
  hint?: string;
}

interface Rule {
  re: RegExp;
  code: ErrorCode;
  hint?: string;
}

/** Ordered: first match wins. Strings taken from developtools_hdc host/common sources. */
const RULES: Rule[] = [
  {
    re: /No any connected target|No any target/i,
    code: 'TRN-HDC-NO-TARGET',
    hint: 'Connect the board over OTG USB or run "hdc tconn <ip>:8710".',
  },
  {
    re: /Not match target founded|check connect-key/i,
    code: 'TRN-HDC-TARGET-NOT-FOUND',
    hint: 'The device key is not in "hdc list targets"; refresh the device list.',
  },
  {
    re: /Connect server|server.*(failed|error)|Kill server/i,
    code: 'TRN-HDC-SERVER',
    hint: 'Restart the hdc server: "hdc kill -r".',
  },
  {
    re: /Unauthorized|unauthorized/,
    code: 'TRN-HDC-UNAUTHORIZED',
    hint: 'Authorize the host on the device.',
  },
  {
    re: /Connect failed|CreateConnect failed/i,
    code: 'TRN-HDCD-UNREACHABLE',
    hint: 'Check the board IP, that hdcd listens (tmode port 8710) and the network.',
  },
  {
    re: /\[E00510[12]\]|Remote path: .* is invalid|There is no remote path|Error opening file|no such file or directory/i,
    code: 'TRN-HDC-REMOTE-PATH',
    hint: 'Check that the device directory exists and is writable (paths.tmpDir in the device profile).',
  },
  {
    re: /Transfer Stop|Transfer path|FileTransfer|There is no local and remote path|Operation failed, because the source folder is empty|Target file is the same date or newer/i,
    code: 'TRN-HDC-FILE-TRANSFER',
  },
  {
    re: /Forward parament failed|Forwardport result:\s*Failed|forward ruler failed|fport/i,
    code: 'TRN-HDC-FPORT',
    hint: 'The local port may be in use; run "hdc fport ls" and remove stale rules.',
  },
  {
    re: /\[E001001\]|Unknown command/i,
    code: 'TRN-HDC-UNKNOWN-COMMAND',
    hint: 'The hdcd build may have this command trimmed (ARCHITECTURE §9.4).',
  },
];

/** Returns the failure carried by hdc output, or undefined when it does not contain a [Fail] line. */
export function findFailure(output: string): HdcFailure | undefined {
  const failLine = lines(output).find((l) => l.trimStart().startsWith(MESSAGE_FAIL));
  if (!failLine) return undefined;
  return classifyFailure(failLine.trimStart().slice(MESSAGE_FAIL.length).trim());
}

export function classifyFailure(message: string): HdcFailure {
  const hdcCode = /\[(E\d{6})\]/.exec(message)?.[1];
  for (const r of RULES) if (r.re.test(message)) return { code: r.code, hdcCode, message, hint: r.hint };
  return { code: 'TRN-HDC-FAILED', hdcCode, message };
}

/** Strips [Info] prefixes; used for user-facing echo. */
export function stripInfo(output: string): string {
  return lines(output)
    .map((l) => (l.startsWith(MESSAGE_INFO) ? l.slice(MESSAGE_INFO.length) : l))
    .join('\n');
}

/** `hdc -v` / `hdc version` → "3.1.0e" (common/base.cpp GetVersion "Ver: %x.%x.%x%c"). */
export function parseVersion(output: string): string | undefined {
  return /Ver:\s*([0-9a-f]+\.[0-9a-f]+\.[0-9a-f]+[a-p]?)/i.exec(output)?.[1];
}

/** `hdc tconn ip:port` → true on "Connect OK", false otherwise. */
export function parseTconn(output: string): { ok: boolean; failure?: HdcFailure } {
  if (/Connect OK/.test(output)) return { ok: true };
  if (/Target is connected|already connected/i.test(output)) return { ok: true };
  const raw = findFailure(output) ?? classifyFailure(output.trim() || 'Connect failed');
  return { ok: false, failure: enrichHdcFailure(raw, 'tconn', output) };
}
