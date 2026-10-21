/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Range } from '../hml/parser';

export interface CssSelector {
  /** one comma-separated part, trimmed */
  text: string;
  range: Range;
}

export interface CssDeclaration {
  property: string;
  propertyRange: Range;
  value: string;
  valueRange: Range;
}

export interface CssRule {
  selectors: CssSelector[];
  /** `{` … `}` (end = text length when unclosed) */
  block: Range;
  declarations: CssDeclaration[];
  /** inside @keyframes: selectors are from/to/percentages, not element selectors */
  inKeyframes: boolean;
}

export interface CssComment {
  text: string;
  range: Range;
}

export interface CssDocument {
  text: string;
  rules: CssRule[];
  comments: CssComment[];
}

/**
 * Tolerant CSS scanner for the lite subset: rules, `@media {}` (rules inside are kept), `@keyframes {}`
 * (marked), `@import …;`. Comments are blanked so offsets stay exact. Nested LESS rules are flattened.
 */
export function parseCss(text: string): CssDocument {
  const comments: CssComment[] = [];
  let src = ''; // comments blanked
  let mask = ''; // additionally string interiors blanked: drives the structural scan
  for (let i = 0; i < text.length;) {
    if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      comments.push({ text: text.slice(i + 2, end < 0 ? text.length : end), range: { start: i, end: stop } });
      const blank = text.slice(i, stop).replace(/[^\n]/g, ' ');
      src += blank;
      mask += blank;
      i = stop;
    } else if (text[i] === '"' || text[i] === "'") {
      const q = text[i]!;
      let j = i + 1;
      while (j < text.length && text[j] !== q && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      const lit = text.slice(i, Math.min(j + 1, text.length));
      src += lit;
      mask += lit[0] + lit.slice(1, -1).replace(/[^\n]/g, '_') + (lit.length > 1 ? lit[lit.length - 1] : '');
      i = j + 1;
    } else {
      src += text[i];
      mask += text[i++];
    }
  }
  const rules: CssRule[] = [];
  // stack of open blocks: 'rule' (with its CssRule), 'media', 'keyframes'
  const stack: Array<{ kind: 'rule' | 'media' | 'keyframes'; rule?: CssRule }> = [];
  let segStart = 0;
  const inKeyframes = (): boolean => stack.some((s) => s.kind === 'keyframes');
  for (let i = 0; i < src.length; i++) {
    const c = mask[i];
    if (c === '{') {
      const head = src.slice(segStart, i);
      const trimmed = head.trim();
      if (/^@media\b/i.test(trimmed) || /^@supports\b/i.test(trimmed)) stack.push({ kind: 'media' });
      else if (/^@(-\w+-)?keyframes\b/i.test(trimmed)) stack.push({ kind: 'keyframes' });
      else {
        const rule: CssRule = {
          selectors: splitSelectors(head, segStart),
          block: { start: i, end: src.length },
          declarations: [],
          inKeyframes: inKeyframes(),
        };
        rules.push(rule);
        stack.push({ kind: 'rule', rule });
      }
      segStart = i + 1;
    } else if (c === '}') {
      flushDeclaration(stack, src, segStart, i);
      const top = stack.pop();
      if (top?.rule) top.rule.block.end = i + 1;
      segStart = i + 1;
    } else if (c === ';') {
      flushDeclaration(stack, src, segStart, i);
      segStart = i + 1;
    }
  }
  flushDeclaration(stack, src, segStart, src.length);
  return { text, rules, comments };
}

function splitSelectors(head: string, base: number): CssSelector[] {
  const out: CssSelector[] = [];
  let start = 0;
  const push = (end: number): void => {
    const raw = head.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, range: { start: base + start + lead, end: base + start + lead + t.length } });
  };
  for (let i = 0; i < head.length; i++) {
    if (head[i] === ',') {
      push(i);
      start = i + 1;
    }
  }
  push(head.length);
  return out;
}

function flushDeclaration(
  stack: ReadonlyArray<{ rule?: CssRule }>,
  src: string,
  start: number,
  end: number,
): void {
  const rule = stack[stack.length - 1]?.rule;
  if (!rule) return;
  const seg = src.slice(start, end);
  const colon = seg.indexOf(':');
  if (colon < 0) return;
  const rawProp = seg.slice(0, colon);
  const property = rawProp.trim();
  if (!/^[A-Za-z-][\w-]*$/.test(property)) return;
  const pStart = start + rawProp.indexOf(property);
  const rawValue = seg.slice(colon + 1);
  const value = rawValue.trim();
  const vStart = start + colon + 1 + (rawValue.length - rawValue.trimStart().length);
  rule.declarations.push({
    property,
    propertyRange: { start: pStart, end: pStart + property.length },
    value,
    valueRange: { start: vStart, end: vStart + value.length },
  });
}

/** `.a`, `#b:active` … → classes and ids used by a selector part (best effort). */
export function selectorTargets(selector: string): { classes: string[]; ids: string[] } {
  return {
    classes: [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!),
    ids: [...selector.matchAll(/#([A-Za-z_][\w-]*)/g)].map((m) => m[1]!),
  };
}
