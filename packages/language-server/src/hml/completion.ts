/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FieldSchema } from '@ohjs/schemas';
import { classifyAttribute } from './attribute-names';
import { elementAt, type HmlDocument, type HmlElement, type Range } from './parser';
import type { SchemaView } from './schema-view';
import type { ViewModelSymbols } from '../js/viewmodel';

export type HmlCompletionKind =
  'component' | 'closeTag' | 'attribute' | 'directive' | 'event' | 'variable' | 'method' | 'function';

export interface HmlCompletion {
  label: string;
  kind: HmlCompletionKind;
  /** text that replaces `replace` */
  insertText: string;
  /** true when insertText uses snippet syntax ($1, $0) */
  snippet: boolean;
  replace: Range;
  detail?: string;
  documentation?: string;
  sortText?: string;
}

export type CompletionContext =
  | { kind: 'tagName'; prefix: string; range: Range; parent?: HmlElement }
  | { kind: 'closeTag'; prefix: string; range: Range; open?: HmlElement }
  | { kind: 'attributeName'; prefix: string; range: Range; element: HmlElement }
  | { kind: 'attributeValue'; element: HmlElement; attribute: string; prefix: string; range: Range }
  | { kind: 'expression'; element?: HmlElement; prefix: string; range: Range; member: boolean }
  | { kind: 'none' };

const TAG_CHAR = /[A-Za-z0-9_-]/;
const ATTR_CHAR = /[^\s"'<>/=]/;

/** Works out what is being typed at offset, from the raw text plus the tolerant tree. */
export function completionContext(doc: HmlDocument, offset: number): CompletionContext {
  const t = doc.text;
  if (doc.comments.some((c) => c.range.start < offset && offset < c.range.end)) return { kind: 'none' };
  const open = t.lastIndexOf('{{', offset - 2 >= 0 ? offset - 2 : 0);
  if (open >= 0 && open + 2 <= offset) {
    const between = t.slice(open + 2, offset);
    if (!between.includes('}}') && !between.includes('<')) {
      let ws = offset;
      while (ws > open + 2 && /[\w$]/.test(t[ws - 1]!)) ws--;
      let we = offset;
      while (we < t.length && /[\w$]/.test(t[we]!)) we++;
      const el = elementAt(doc, offset);
      return {
        kind: 'expression',
        prefix: t.slice(ws, offset),
        range: { start: ws, end: we },
        member: t[ws - 1] === '.',
        ...(el ? { element: el } : {}),
      };
    }
  }
  let s = offset;
  while (s > 0 && TAG_CHAR.test(t[s - 1]!)) s--;
  let e = offset;
  while (e < t.length && TAG_CHAR.test(t[e]!)) e++;
  if (t[s - 1] === '<') {
    return {
      kind: 'tagName',
      prefix: t.slice(s, offset),
      range: { start: s, end: e },
      ...parentAt(doc, s - 1),
    };
  }
  if (t[s - 1] === '/' && t[s - 2] === '<') {
    let open = elementAt(doc, s - 2);
    // skip elements that already ended before the cursor (e.g. a closed sibling ending right here)
    while (open && open.closed && open.range.end <= s - 2) open = open.parent;
    return {
      kind: 'closeTag',
      prefix: t.slice(s, offset),
      range: { start: s - 2, end: t[e] === '>' ? e + 1 : e },
      ...(open ? { open } : {}),
    };
  }
  const el = elementAt(doc, offset);
  if (
    !el ||
    offset > el.startTagEnd ||
    (el.startTagClosed && offset === el.startTagEnd) ||
    offset <= el.nameRange.end
  )
    return { kind: 'none' };
  for (const a of el.attributes) {
    if (a.valueRange && offset >= a.valueRange.start && offset <= a.valueRange.end) {
      let ws = offset;
      while (ws > a.valueRange.start && /[\w$]/.test(t[ws - 1]!)) ws--;
      let we = offset;
      while (we < a.valueRange.end && /[\w$]/.test(t[we]!)) we++;
      return {
        kind: 'attributeValue',
        element: el,
        attribute: a.name,
        prefix: t.slice(ws, offset),
        range: { start: ws, end: we },
      };
    }
  }
  let as = offset;
  while (as > 0 && ATTR_CHAR.test(t[as - 1]!)) as--;
  let ae = offset;
  while (ae < t.length && ATTR_CHAR.test(t[ae]!)) ae++;
  if (!/\s/.test(t[as - 1] ?? '')) return { kind: 'none' };
  return { kind: 'attributeName', prefix: t.slice(as, offset), range: { start: as, end: ae }, element: el };
}

function parentAt(doc: HmlDocument, ltOffset: number): { parent?: HmlElement } {
  // the element being typed is itself in the tree; its parent is the container
  const el = elementAt(doc, ltOffset + 1);
  const parent = el && el.range.start === ltOffset ? el.parent : el;
  return parent ? { parent } : {};
}

function docOf(f: FieldSchema): { detail?: string; documentation?: string } {
  const parts: string[] = [];
  if (f.since) parts.push(`since API ${f.since}`);
  if (f.availability === 'code-doc-missing') parts.push('implemented in the engine, undocumented');
  if (f.availability === 'conditional')
    parts.push(`depends on build flags${f.feature ? ` (${f.feature})` : ''}`);
  return {
    ...(parts.length ? { detail: parts.join(' · ') } : {}),
    ...(f.doc ? { documentation: f.doc } : {}),
  };
}

/** HML completion (FR-LANG-004 subset): tags constrained by the parent, attributes, directives and events. */
export function completeHml(
  doc: HmlDocument,
  offset: number,
  view: SchemaView,
  vm?: ViewModelSymbols,
): HmlCompletion[] {
  const ctx = completionContext(doc, offset);
  switch (ctx.kind) {
    case 'expression': {
      if (ctx.member) return [];
      const items: HmlCompletion[] = [];
      const add = (label: string, kind: HmlCompletionKind, detail: string, sort: string): void => {
        if (!items.some((i) => i.label === label))
          items.push({
            label,
            kind,
            insertText: label,
            snippet: false,
            replace: ctx.range,
            detail,
            sortText: `${sort}${label}`,
          });
      };
      for (const v of loopVariables(ctx.element)) add(v, 'variable', 'for loop variable', '0');
      for (const d of vm?.data ?? []) add(d, 'variable', 'data', '1');
      for (const d of vm?.props ?? []) add(d, 'variable', 'props', '1');
      for (const d of vm?.computed ?? []) add(d, 'variable', 'computed', '1');
      for (const m of vm?.methods ?? []) add(m, 'method', 'method', '2');
      add('$t', 'function', 'i18n: $t(key)', '3');
      return items;
    }
    case 'attributeValue': {
      const k = classifyAttribute(ctx.attribute);
      if (k.kind !== 'event' || view.attribute(ctx.element.tag, ctx.attribute)) return [];
      return (vm?.methods ?? []).map((m) => ({
        label: m,
        kind: 'method' as const,
        insertText: m,
        snippet: false,
        replace: ctx.range,
        detail: `handler for "${k.event}"`,
      }));
    }
    case 'tagName': {
      const parent = ctx.parent && view.component(ctx.parent.tag) ? ctx.parent.tag : undefined;
      return view
        .usableComponents()
        .filter((c) => !parent || view.allowsChild(parent, c.tag))
        .map((c) => ({
          label: c.tag,
          kind: 'component' as const,
          insertText: c.children === 'none' ? `${c.tag}$1></${c.tag}>` : `${c.tag}$1>$0</${c.tag}>`,
          snippet: true,
          replace: ctx.range,
          detail: `${c.category}${c.availability === 'conditional' ? ' · depends on build flags' : ''}${c.availability === 'code-doc-missing' ? ' · undocumented' : ''}${c.since ? ` · since API ${c.since}` : ''}`,
        }));
    }
    case 'closeTag': {
      if (!ctx.open || ctx.open.closed) return [];
      return [
        {
          label: `/${ctx.open.tag}`,
          kind: 'closeTag',
          insertText: `</${ctx.open.tag}>`,
          snippet: false,
          replace: ctx.range,
        },
      ];
    }
    case 'attributeName': {
      const el = ctx.element;
      const present = new Set(
        el.attributes.filter((a) => a.nameRange.start !== ctx.range.start).map((a) => a.name),
      );
      const presentEvents = new Set(
        [...present]
          .map((n) => classifyAttribute(n))
          .flatMap((k) => (k.kind === 'event' ? [k.event.toLowerCase()] : [])),
      );
      if (!view.component(el.tag)) return [];
      const items: HmlCompletion[] = [];
      for (const a of view.attributes(el.tag)) {
        if (present.has(a.name) || a.field.availability === 'disabled-by-feature') continue;
        items.push({
          label: a.name,
          kind: a.origin === 'directive' ? 'directive' : 'attribute',
          insertText: a.name === 'else' ? 'else' : `${a.name}="$1"`,
          snippet: a.name !== 'else',
          replace: ctx.range,
          sortText: `${a.origin === 'component' ? '0' : a.origin === 'common' ? '1' : '2'}${a.name}`,
          ...docOf(a.field),
        });
      }
      // `@` prefix completes event names after it; otherwise offer the `on` form
      const atForm = ctx.prefix.startsWith('@');
      for (const ev of view.events(el.tag)) {
        if (presentEvents.has(ev.name.toLowerCase()) || ev.field.availability === 'disabled-by-feature')
          continue;
        const name = ev.name.toLowerCase();
        const label = atForm ? `@${name}` : `on${name}`;
        items.push({
          label,
          kind: 'event',
          insertText: `${label}="$1"`,
          snippet: true,
          replace: ctx.range,
          sortText: `3${name}`,
          ...docOf(ev.field),
        });
      }
      return items;
    }
    default:
      return [];
  }
}

/**
 * Loop variables visible at an element: `for="{{list}}"` → $item, $idx; `for="{{v in list}}"` → v, $idx;
 * `for="{{(i, v) in list}}"` → i, v. Collected from the element and its ancestors.
 */
export function loopVariables(el: HmlElement | undefined): string[] {
  const out: string[] = [];
  for (let e = el; e; e = e.parent) {
    const f = e.attributes.find((a) => a.name === 'for');
    if (!f || f.value === undefined) continue;
    const inner = f.value.replace(/^\s*\{\{|\}\}\s*$/g, '').trim();
    const pair = /^\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s+in\s+/.exec(inner);
    const single = /^([A-Za-z_$][\w$]*)\s+in\s+/.exec(inner);
    if (pair) out.push(pair[1]!, pair[2]!);
    else if (single) out.push(single[1]!, '$idx');
    else out.push('$item', '$idx');
  }
  return [...new Set(out)];
}
