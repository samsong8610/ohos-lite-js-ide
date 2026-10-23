/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HdcFailure } from '../parser/messages';
import { ideErrorChannelSpec } from './catalog';
import type { IdeErrorChannel, IdeErrorMatch } from './types';

/** Substring / pipe-alternative match per vendored `pattern` field (1.x semantics). */
export function patternMatchesVendored(pattern: string, text: string): boolean {
  if (pattern.includes('|')) {
    return pattern.split('|').some((part) => text.includes(part.trim()));
  }
  return text.includes(pattern);
}

/** First matching failure entry for `channel` in `output` (ordered list in JSON). */
export function matchIdeError(channel: IdeErrorChannel, output: string): IdeErrorMatch | undefined {
  const spec = ideErrorChannelSpec(channel);
  for (const f of spec.failures) {
    if (patternMatchesVendored(f.pattern, output)) {
      return {
        channel,
        code: f.code,
        pattern: f.pattern,
        ide_hint: f.ide_hint,
        when: f.when,
      };
    }
  }
  return undefined;
}

export function isIdeSuccess(channel: IdeErrorChannel, output: string): boolean {
  const spec = ideErrorChannelSpec(channel);
  return spec.success_patterns.some((p) => output.includes(p));
}

/** Merge vendored ide_hint / hdc code into transport failure objects. */
export function enrichHdcFailure(failure: HdcFailure, channel: IdeErrorChannel, output: string): HdcFailure {
  const m = matchIdeError(channel, output) ?? matchIdeError(channel, failure.message);
  if (!m) return failure;
  const hdcCode = m.code ?? failure.hdcCode;
  let message = failure.message;
  if (m.code && !message.includes(m.code)) {
    message = `[${m.code}] ${message}`;
  }
  return {
    ...failure,
    hdcCode,
    message,
    hint: m.ide_hint,
  };
}

export function deployFailureHint(channel: 'bm' | 'aa', output: string): string | undefined {
  return matchIdeError(channel, output)?.ide_hint;
}

export function formatUserFacingHdcError(failure: HdcFailure): string {
  const parts = [failure.hdcCode ? `[${failure.hdcCode}]` : undefined, failure.message].filter(Boolean);
  const head = parts.join(' ').trim() || failure.message;
  return failure.hint ? `${head}\n${failure.hint}` : head;
}
