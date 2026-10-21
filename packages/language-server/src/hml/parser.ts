/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Half-open offset range [start, end) into the document text. */
export interface Range {
  start: number;
  end: number;
}

export interface HmlAttribute {
  name: string;
  nameRange: Range;
  /** undefined for a bare attribute (`<div show>`) */
  value?: string;
  /** range of the value without the quotes */
  valueRange?: Range;
  quote?: '"' | "'";
}

export interface HmlElement {
  tag: string;
  /** `<` to the end of the end tag (or of the last parsed content when unclosed) */
  range: Range;
  nameRange: Range;
  /** end of the start tag (offset after `>`), or where it stopped when the `>` is missing */
  startTagEnd: number;
  startTagClosed: boolean;
  selfClosing: boolean;
  /** an explicit `</tag>` was found */
  closed: boolean;
  endTagRange?: Range;
  attributes: HmlAttribute[];
  children: HmlElement[];
  parent?: HmlElement;
}

export interface HmlComment {
  text: string;
  range: Range;
}

export type ParseProblemCode =
  'unclosed-tag' | 'unmatched-close-tag' | 'unterminated-comment' | 'unterminated-start-tag';

export interface ParseProblem {
  code: ParseProblemCode;
  message: string;
  range: Range;
}

export interface HmlDocument {
  text: string;
  roots: HmlElement[];
  comments: HmlComment[];
  problems: ParseProblem[];
}

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_:\-.@]/;
const ATTR_CHAR = /[^\s"'<>/=]/;

/**
 * Fault-tolerant HML parser (ARCHITECTURE §7.1). Never throws: malformed markup produces
 * `problems` and a best-effort tree with exact offsets, which completion relies on while typing.
 * `{{ }}` interpolations are kept verbatim inside attribute values and text.
 */
export function parseHml(text: string): HmlDocument {
  const roots: HmlElement[] = [];
  const comments: HmlComment[] = [];
  const problems: ParseProblem[] = [];
  const stack: HmlElement[] = [];
  const append = (el: HmlElement): void => {
    const parent = stack[stack.length - 1];
    if (parent) {
      el.parent = parent;
      parent.children.push(el);
    } else roots.push(el);
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) {
        problems.push({
          code: 'unterminated-comment',
          message: 'Comment is not terminated (missing "-->")',
          range: { start: lt, end: n },
        });
        comments.push({ text: text.slice(lt + 4), range: { start: lt, end: n } });
        i = n;
        break;
      }
      comments.push({ text: text.slice(lt + 4, end), range: { start: lt, end: end + 3 } });
      i = end + 3;
      continue;
    }
    if (text[lt + 1] === '/') {
      // end tag
      let j = lt + 2;
      const nameStart = j;
      while (j < n && NAME_CHAR.test(text[j]!)) j++;
      const name = text.slice(nameStart, j);
      const gt = text.indexOf('>', j);
      const nextLt = text.indexOf('<', j);
      const end = gt >= 0 && (nextLt < 0 || gt < nextLt) ? gt + 1 : j;
      const range = { start: lt, end };
      let idx = -1;
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.tag === name) {
          idx = k;
          break;
        }
      }
      if (idx < 0) {
        problems.push({
          code: 'unmatched-close-tag',
          message: `Closing tag </${name}> has no matching start tag`,
          range,
        });
      } else {
        while (stack.length > idx + 1) {
          const open = stack.pop()!;
          open.range.end = lt;
          problems.push({
            code: 'unclosed-tag',
            message: `<${open.tag}> is not closed`,
            range: open.nameRange,
          });
        }
        const el = stack.pop()!;
        el.closed = true;
        el.endTagRange = range;
        el.range.end = end;
      }
      i = end;
      continue;
    }
    if (!NAME_START.test(text[lt + 1] ?? '')) {
      i = lt + 1; // a stray '<' in text
      continue;
    }
    // start tag
    let j = lt + 1;
    const nameStart = j;
    while (j < n && NAME_CHAR.test(text[j]!)) j++;
    const el: HmlElement = {
      tag: text.slice(nameStart, j),
      range: { start: lt, end: j },
      nameRange: { start: nameStart, end: j },
      startTagEnd: j,
      startTagClosed: false,
      selfClosing: false,
      closed: false,
      attributes: [],
      children: [],
    };
    // attributes
    for (;;) {
      while (j < n && /\s/.test(text[j]!)) j++;
      if (j >= n || text[j] === '<') break;
      if (text[j] === '>') {
        el.startTagClosed = true;
        j++;
        break;
      }
      if (text[j] === '/' && text[j + 1] === '>') {
        el.startTagClosed = true;
        el.selfClosing = true;
        j += 2;
        break;
      }
      if (!ATTR_CHAR.test(text[j]!)) {
        j++; // junk such as a stray quote or '/'
        continue;
      }
      const aStart = j;
      while (j < n && ATTR_CHAR.test(text[j]!)) j++;
      const attr: HmlAttribute = { name: text.slice(aStart, j), nameRange: { start: aStart, end: j } };
      let k = j;
      while (k < n && /\s/.test(text[k]!)) k++;
      if (text[k] === '=') {
        k++;
        while (k < n && /[ \t]/.test(text[k]!)) k++;
        const q = text[k];
        if (q === '"' || q === "'") {
          const close = text.indexOf(q, k + 1);
          const vEnd = close < 0 ? n : close;
          attr.quote = q;
          attr.value = text.slice(k + 1, vEnd);
          attr.valueRange = { start: k + 1, end: vEnd };
          j = close < 0 ? n : close + 1;
        } else {
          const vStart = k;
          while (k < n && !/[\s>]/.test(text[k]!) && !(text[k] === '/' && text[k + 1] === '>')) k++;
          attr.value = text.slice(vStart, k);
          attr.valueRange = { start: vStart, end: k };
          j = k;
        }
      }
      el.attributes.push(attr);
    }
    el.startTagEnd = j;
    el.range.end = j;
    append(el);
    if (!el.startTagClosed) {
      problems.push({
        code: 'unterminated-start-tag',
        message: `Start tag <${el.tag}> is missing ">"`,
        range: el.nameRange,
      });
    } else if (!el.selfClosing) stack.push(el);
    if (el.selfClosing) el.closed = true;
    i = j;
  }
  while (stack.length) {
    const open = stack.pop()!;
    open.range.end = n;
    problems.push({ code: 'unclosed-tag', message: `<${open.tag}> is not closed`, range: open.nameRange });
  }
  return { text, roots, comments, problems };
}

/** Depth-first walk over all elements. */
export function* walk(nodes: readonly HmlElement[]): Generator<HmlElement> {
  for (const el of nodes) {
    yield el;
    yield* walk(el.children);
  }
}

/** Innermost element whose range contains offset (start < offset <= end). */
export function elementAt(doc: HmlDocument, offset: number): HmlElement | undefined {
  let found: HmlElement | undefined;
  let level: readonly HmlElement[] = doc.roots;
  for (;;) {
    const el = level.find((e) => e.range.start < offset && offset <= e.range.end);
    if (!el) return found;
    found = el;
    level = el.children;
  }
}
