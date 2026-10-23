/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ForwardRule } from '@ohjs/core';
import { EMPTY_ECHO, lines } from './common';
import { enrichHdcFailure } from '../ide-error-codes/match';
import { findFailure, type HdcFailure } from './messages';

/**
 * `hdc fport ls` (host/server.cpp BuildForwardVisableLine): "%s    %s    %s\n" = key, "tcp:L tcp:R", [Forward]|[Reverse]
 */
export function parseFportList(output: string): ForwardRule[] {
  const out: ForwardRule[] = [];
  for (const line of lines(output)) {
    const t = line.trim();
    if (t === EMPTY_ECHO) continue;
    const m = /^(\S+)\s+(\S+)\s+(\S+)\s+\[(Forward|Reverse)\]$/.exec(t);
    if (!m) continue;
    out.push({
      key: m[1]!,
      local: m[2]!,
      remote: m[3]!,
      direction: m[4] === 'Forward' ? 'forward' : 'reverse',
    });
  }
  return out;
}

/** `hdc fport tcp:L tcp:R` → "Forwardport result:OK" (common/forward.cpp). */
export function parseFportAdd(output: string): { ok: boolean; failure?: HdcFailure } {
  if (/Forwardport result:\s*OK/.test(output) && !findFailure(output)) return { ok: true };
  const base: HdcFailure = findFailure(output) ?? {
    code: 'TRN-HDC-FPORT',
    message: output.trim() || 'no fport result',
  };
  return { ok: false, failure: enrichHdcFailure(base, 'fport', output) };
}

/** `hdc fport rm …` → "Remove forward ruler success, ruler:…" */
export function parseFportRemove(output: string): { ok: boolean; failure?: HdcFailure } {
  if (/Remove forward ruler success/.test(output)) return { ok: true };
  return {
    ok: false,
    failure: findFailure(output) ?? { code: 'TRN-HDC-FPORT', message: output.trim() || 'no fport rm result' },
  };
}
