/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type RuleSeverity = 'error' | 'warning' | 'information' | 'hint' | 'off';

/** Rule IDs and default severities (ARCHITECTURE §7.2 rule table; FR-LANG-006). */
export const RULES = {
  'hml/syntax': 'error',
  'hml/unknown-component': 'error',
  'hml/component-disabled-by-feature': 'error',
  'hml/unknown-attribute': 'error',
  'hml/attribute-disabled-by-feature': 'warning',
  'hml/doc-only-attribute': 'warning',
  'hml/unknown-event': 'error',
  'hml/doc-only-event': 'warning',
  'hml/unknown-event-modifier': 'error',
  'hml/invalid-child': 'error',
  'hml/for-with-if': 'warning',
  'hml/empty-event-handler': 'warning',
  'hml/conditional-component': 'information',
  'css/unsupported-selector': 'error',
  'css/unsupported-pseudo': 'error',
  'hml/es6-in-expression': 'error',
  'js/es6-syntax': 'warning',
  'js/es6-untranspilable': 'error',
  'js/unsupported-builtin': 'error',
  'js/unknown-system-module': 'error',
  'prj/missing-app-module': 'error',
  'prj/device-type': 'error',
  'prj/missing-pages': 'error',
  'prj/first-page-not-index': 'error',
  'prj/page-file-missing': 'error',
  'prj/page-not-registered': 'warning',
  'i18n/missing-key': 'error',
  'i18n/missing-translation': 'warning',
  'prj/page-name-conflict': 'error',
  'res/image-format': 'error',
  'feature/rotation-disabled': 'warning',
} as const satisfies Record<string, RuleSeverity>;

export type RuleId = keyof typeof RULES;
/** @deprecated kept for batch-1 imports; use RULES / RuleId */
export const HML_RULES = RULES;
export type HmlRuleId = RuleId;

export function isRuleId(id: string): id is RuleId {
  return Object.prototype.hasOwnProperty.call(RULES, id);
}

/** User settings (`ohjs.lang.rules`) override defaults; unknown IDs and bad values are ignored. */
export function resolveSeverity(
  id: HmlRuleId,
  overrides: Readonly<Record<string, unknown>> | undefined,
): RuleSeverity {
  const o = overrides?.[id];
  if (o === 'error' || o === 'warning' || o === 'information' || o === 'hint' || o === 'off') return o;
  return RULES[id];
}

export interface Suppressions {
  /** rules disabled for the whole file ('*' = all) */
  file: Set<string>;
  /** line (0-based) → rules disabled on that line */
  lines: Map<number, Set<string>>;
}

/**
 * `<!-- ohjs-disable rule-a, rule-b -->` disables for the file (no IDs = all rules);
 * `<!-- ohjs-disable-next-line rule -->` disables for the following line.
 */
export function parseSuppressions(comments: ReadonlyArray<{ text: string; endLine: number }>): Suppressions {
  const s: Suppressions = { file: new Set(), lines: new Map() };
  for (const c of comments) {
    const m = /^\s*ohjs-disable(-next-line)?(?:\s+([\s\S]*?))?\s*$/.exec(c.text);
    if (!m) continue;
    const ids = (m[2] ?? '').split(/[\s,]+/).filter(Boolean);
    const set = ids.length ? ids : ['*'];
    if (m[1]) {
      const line = c.endLine + 1;
      const cur = s.lines.get(line) ?? new Set<string>();
      for (const id of set) cur.add(id);
      s.lines.set(line, cur);
    } else for (const id of set) s.file.add(id);
  }
  return s;
}

export function isSuppressed(s: Suppressions, id: string, line: number): boolean {
  if (s.file.has('*') || s.file.has(id)) return true;
  const l = s.lines.get(line);
  return !!l && (l.has('*') || l.has(id));
}
