/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { conditionsByLine, requiredFeature, stripComments } from './cpp';

export interface KeywordEntry {
  /** enum name without the K_ prefix, e.g. SCROLLPAGE */
  enumName: string;
  /** runtime key string, e.g. scrollpage / alignItems / analog-clock */
  key: string;
  line: number;
  feature?: string;
}

/** KeysHParser: `KEYWORD(ENUM, key-string)` entries of src/core/base/keys.h (ARCHITECTURE §7.4 P2). */
export function parseKeysH(text: string): KeywordEntry[] {
  const src = stripComments(text);
  const conds = conditionsByLine(src);
  const out: KeywordEntry[] = [];
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    const m = /^\s*KEYWORD\(\s*([A-Z0-9_]+)\s*,\s*([^)\s]+)\s*\)/.exec(l);
    if (!m) return;
    const feature = requiredFeature(conds[i + 1] ?? []);
    out.push({ enumName: m[1]!, key: m[2]!, line: i + 1, ...(feature ? { feature } : {}) });
  });
  return out;
}

export function keysByEnum(entries: KeywordEntry[]): Map<string, KeywordEntry> {
  return new Map(entries.map((e) => [`K_${e.enumName}`, e]));
}
