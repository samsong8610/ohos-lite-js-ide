/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandSpec } from './platform/types';

/**
 * Error codes by domain (ARCHITECTURE §5.3 / §13):
 * ENV (tools), PRJ (project/profile), BLD, DEP, DBG, LOG, TRN (transport), PROC (process runner).
 */
export type ErrorCode =
  | 'ENV-TOOL-NOT-FOUND'
  | 'ENV-HDC-NOT-FOUND'
  | 'ENV-TOOL-VERSION'
  | 'PROC-SPAWN-FAILED'
  | 'PROC-TIMEOUT'
  | 'PROC-CANCELLED'
  | 'PRJ-PROFILE-INVALID'
  | 'PRJ-PROFILE-NOT-FOUND'
  | 'PRJ-PROFILE-CYCLE'
  | 'PRJ-PROFILE-TEMPLATE-VAR'
  | 'PRJ-BUNDLE-INVALID'
  | 'PRJ-SCAFFOLD-FAILED'
  | 'TRN-HDC-NO-TARGET'
  | 'TRN-HDC-TARGET-NOT-FOUND'
  | 'TRN-HDC-UNAUTHORIZED'
  | 'TRN-HDCD-UNREACHABLE'
  | 'TRN-HDC-CONNECT-FAILED'
  | 'TRN-HDC-SERVER'
  | 'TRN-HDC-FILE-TRANSFER'
  | 'TRN-HDC-REMOTE-PATH'
  | 'TRN-HDC-FPORT'
  | 'TRN-HDC-UNKNOWN-COMMAND'
  | 'TRN-HDC-TIMEOUT'
  | 'TRN-HDC-CANCELLED'
  | 'TRN-HDC-FAILED'
  | 'BLD-FAILED'
  | 'BLD-NO-PROJECT'
  | 'BLD-TOOL-MISSING'
  | 'DEP-HAP-PATH'
  | 'DEP-INSTALL-FAILED'
  | 'DEP-UNINSTALL-FAILED'
  | 'DEP-START-FAILED'
  | 'DEP-NO-TARGET'
  | 'LOG-CAPTURE-FAILED';

export interface ErrorDetail {
  raw?: string;
  cmd?: CommandSpec;
  exitCode?: number | null;
  hint?: string;
  docUrl?: string;
}

export class OhjsError extends Error {
  override readonly name = 'OhjsError';
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly detail: ErrorDetail = {},
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function isOhjsError(e: unknown, code?: ErrorCode): e is OhjsError {
  return e instanceof OhjsError && (code === undefined || e.code === code);
}
