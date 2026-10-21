/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse } from 'jsonc-parser';
import type { HmlDocument, Range } from '../hml/parser';

/** Leaf key paths of one i18n/<locale>.json (`{"strings": {"hello": "Hi"}}` → `strings.hello`). */
export function i18nKeys(text: string): Set<string> {
  const keys = new Set<string>();
  const walk = (v: unknown, prefix: string): void => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, c] of Object.entries(v)) walk(c, prefix ? `${prefix}.${k}` : k);
    } else if (prefix) keys.add(prefix);
  };
  walk(parse(text) as unknown, '');
  return keys;
}

export interface Interpolation {
  /** text between `{{` and `}}` */
  expr: string;
  /** offset of the first character after `{{` */
  start: number;
}

/** Every closed `{{ … }}` in text and attribute values, skipping comments. */
export function interpolations(doc: HmlDocument): Interpolation[] {
  const out: Interpolation[] = [];
  const t = doc.text;
  const inComment = (o: number): boolean => doc.comments.some((c) => o >= c.range.start && o < c.range.end);
  for (let i = t.indexOf('{{'); i >= 0; i = t.indexOf('{{', i + 2)) {
    const end = t.indexOf('}}', i + 2);
    if (end < 0) break;
    const lt = t.indexOf('<', i + 2);
    if (inComment(i) || (lt >= 0 && lt < end)) continue;
    out.push({ expr: t.slice(i + 2, end), start: i + 2 });
    i = end;
  }
  return out;
}

export interface TranslationRef {
  key: string;
  /** range of the key text inside the quotes */
  range: Range;
}

/** Literal `$t('a.b')` keys (dynamic keys such as `$t('a.' + x)` are skipped). */
export function translationRefs(doc: HmlDocument): TranslationRef[] {
  const out: TranslationRef[] = [];
  const re = /\$t\(\s*(['"])([^'"\n]*)\1\s*[,)]/g;
  for (const ip of interpolations(doc)) {
    for (let m = re.exec(ip.expr); m; m = re.exec(ip.expr)) {
      const start = ip.start + m.index + m[0].indexOf(m[1]!) + 1;
      out.push({ key: m[2]!, range: { start, end: start + m[2]!.length } });
    }
  }
  return out;
}
