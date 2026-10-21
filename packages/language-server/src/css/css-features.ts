/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FieldSchema } from '@ohjs/schemas';
import type { HmlDocument, Range } from '../hml/parser';
import { walk } from '../hml/parser';
import {
  isSuppressed,
  parseSuppressions,
  resolveSeverity,
  type RuleId,
  type RuleSeverity,
} from '../hml/rules';
import type { SchemaView } from '../hml/schema-view';
import { LineIndex } from '../text';
import { parseCss, selectorTargets, type CssDocument, type CssRule } from './parser';

export { parseCss };

/** Pseudo-classes of the lite CSS syntax (js-lite-framework-syntax-css.md). */
export const SUPPORTED_PSEUDO = ['active', 'checked'] as const;

export interface CssDiagnostic {
  rule: RuleId;
  severity: Exclude<RuleSeverity, 'off'>;
  message: string;
  range: Range;
}

const SIMPLE = /^(?:\.[A-Za-z_][\w-]*|#[A-Za-z_][\w-]*)$/;

/**
 * Selector rules (FR-LANG-006): only `.class`, `#id` and `,` lists; pseudo-classes only `:active`/`:checked`.
 * Rules inside `@keyframes` are skipped (from/to/percent stops).
 */
export function validateCss(
  doc: CssDocument,
  options: { rules?: Readonly<Record<string, unknown>> } = {},
): CssDiagnostic[] {
  const lines = new LineIndex(doc.text);
  const suppress = parseSuppressions(
    doc.comments.map((c) => ({ text: c.text, endLine: lines.lineOf(c.range.end) })),
  );
  const out: CssDiagnostic[] = [];
  const report = (rule: RuleId, range: Range, message: string): void => {
    const severity = resolveSeverity(rule, options.rules);
    if (severity === 'off' || isSuppressed(suppress, rule, lines.lineOf(range.start))) return;
    out.push({ rule, severity, message, range });
  };
  for (const r of doc.rules) {
    if (r.inKeyframes) continue;
    for (const s of r.selectors) {
      const pseudo = /^(.*?)(::?)([A-Za-z-]+)(\(.*\))?$/.exec(s.text);
      const base = pseudo ? pseudo[1]! : s.text;
      if (pseudo) {
        const name = pseudo[3]!;
        if (pseudo[2] === '::' || !(SUPPORTED_PSEUDO as readonly string[]).includes(name)) {
          const at = s.range.start + base.length;
          report(
            'css/unsupported-pseudo',
            { start: at, end: s.range.end },
            `Pseudo-class "${pseudo[2]}${name}" is not supported (only :active and :checked)`,
          );
        }
      }
      if (!SIMPLE.test(base)) {
        const why = /\s|>|\+|~/.test(base.trim())
          ? 'combinators (descendant, child, sibling) are not supported'
          : /\[/.test(base)
            ? 'attribute selectors are not supported'
            : base === '*'
              ? 'the universal selector is not supported'
              : /^[A-Za-z]/.test(base)
                ? 'tag selectors are not supported'
                : 'only a single .class or #id is supported';
        report(
          'css/unsupported-selector',
          { start: s.range.start, end: s.range.start + base.length },
          `Unsupported selector "${base}": ${why}`,
        );
      }
    }
  }
  return out;
}

export interface CssCompletion {
  label: string;
  replace: Range;
  detail?: string;
  documentation?: string;
}

/** Innermost rule whose block contains offset. */
function ruleAt(doc: CssDocument, offset: number): CssRule | undefined {
  let best: CssRule | undefined;
  for (const r of doc.rules) {
    if (r.block.start < offset && offset < r.block.end && (!best || r.block.start > best.block.start))
      best = r;
  }
  return best;
}

/** Tags of HML elements matched by the rule's `.class` / `#id` selectors. */
export function matchedTags(rule: CssRule, hml: HmlDocument): string[] {
  const classes = new Set<string>();
  const ids = new Set<string>();
  for (const s of rule.selectors) {
    const t = selectorTargets(s.text);
    t.classes.forEach((c) => classes.add(c));
    t.ids.forEach((i) => ids.add(i));
  }
  const tags = new Set<string>();
  for (const el of walk(hml.roots)) {
    for (const a of el.attributes) {
      if (a.name === 'class' && a.value && a.value.split(/\s+/).some((c) => classes.has(c))) tags.add(el.tag);
      if (a.name === 'id' && a.value && ids.has(a.value)) tags.add(el.tag);
    }
  }
  return [...tags].sort();
}

/**
 * CSS property completion (FR-LANG-005): styles of the components the selector hits in the same-name
 * HML (union), plus the common styles; when nothing matches, every style of every usable component.
 */
export function completeCss(
  doc: CssDocument,
  offset: number,
  view: SchemaView,
  hml?: HmlDocument,
): CssCompletion[] {
  const rule = ruleAt(doc, offset);
  if (!rule) return [];
  const t = doc.text;
  let s = offset;
  while (s > rule.block.start + 1 && /[\w-]/.test(t[s - 1]!)) s--;
  // must be at the start of a declaration: only whitespace back to `{` or `;`
  let k = s;
  while (k > rule.block.start + 1 && /\s/.test(t[k - 1]!)) k--;
  if (k !== rule.block.start + 1 && t[k - 1] !== ';' && t[k - 1] !== '{') return [];
  let e = offset;
  while (e < t.length && /[\w-]/.test(t[e]!)) e++;
  const replace = { start: s, end: e };
  const tags = !rule.inKeyframes && hml ? matchedTags(rule, hml) : [];
  const comps = tags.length
    ? tags.map((tg) => view.component(tg)).filter((c) => !!c)
    : view.usableComponents();
  const styles = new Map<string, { field: FieldSchema; tags: string[] }>();
  const add = (name: string, field: FieldSchema, tag: string): void => {
    if (field.availability === 'disabled-by-feature') return;
    const cur = styles.get(name);
    if (cur) {
      if (!cur.tags.includes(tag)) cur.tags.push(tag);
    } else styles.set(name, { field, tags: [tag] });
  };
  for (const [name, field] of Object.entries(view.schema.common.styles)) add(name, field, '*');
  for (const c of comps) for (const [name, field] of Object.entries(c.styles)) add(name, field, c.tag);
  return [...styles.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, { field, tags: ts }]) => ({
      label: name,
      replace,
      detail: ts.includes('*') ? 'common style' : ts.map((x) => `<${x}>`).join(' '),
      ...(field.doc ? { documentation: field.doc } : {}),
    }));
}
