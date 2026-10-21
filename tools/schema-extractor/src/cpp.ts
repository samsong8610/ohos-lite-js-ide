/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Minimal C/C++ scanning helpers. Not a parser: enough for the ACE Lite coding patterns, with
// evidence (line numbers) for every extracted fact so a reviewer can check it (M1-5 acceptance).

/** Replaces comments with spaces (newlines kept) so offsets and line numbers stay valid. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') {
          out += src[i]! + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      if (i < src.length) out += src[i++];
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && n === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) {
        out += '  ';
        i += 2;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function lineAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** Active preprocessor conditions for each line (1-based). Header guards are dropped. */
export function conditionsByLine(src: string): string[][] {
  const lines = src.split('\n');
  const stack: string[] = [];
  const result: string[][] = [[]];
  for (const raw of lines) {
    const l = raw.trim();
    let m: RegExpExecArray | null;
    let after: string[] | undefined;
    if ((m = /^#\s*if\s+(.+)$/.exec(l))) {
      result.push([...stack]);
      stack.push(m[1]!.trim());
      continue;
    } else if ((m = /^#\s*ifdef\s+(\w+)/.exec(l))) {
      result.push([...stack]);
      stack.push(`defined(${m[1]})`);
      continue;
    } else if ((m = /^#\s*ifndef\s+(\w+)/.exec(l))) {
      result.push([...stack]);
      stack.push(`!defined(${m[1]})`);
      continue;
    } else if ((m = /^#\s*elif\s+(.+)$/.exec(l))) {
      const prev = stack.pop() ?? '';
      stack.push(`!(${prev}) && ${m[1]!.trim()}`);
    } else if (/^#\s*else\b/.test(l)) {
      const prev = stack.pop() ?? '';
      stack.push(`!(${prev})`);
    } else if (/^#\s*endif\b/.test(l)) {
      stack.pop();
      after = [...stack];
    }
    result.push(after ?? [...stack]);
  }
  return result.map((conds) => conds.filter((c) => !/^!defined\(\w+_H\)$|^!defined\(KEYWORD\)$/.test(c)));
}

/** FEATURE_* macro required by a set of conditions, e.g. "(FEATURE_COMPONENT_VIDEO == 1)". */
export function requiredFeature(conds: readonly string[]): string | undefined {
  for (const c of conds) {
    if (c.startsWith('!')) continue;
    const m = /^\(?\s*(?:defined\()?(FEATURE_[A-Z0-9_]+)\)?\s*(?:==\s*1)?\s*\)?$/.exec(c);
    if (m) return m[1];
  }
  return undefined;
}

export interface FunctionBody {
  name: string;
  /** index of the opening brace */
  open: number;
  /** index of the matching closing brace */
  close: number;
  line: number;
}

/** Finds definitions `Class::Method(...) [const] {` and returns their bodies. */
export function findFunctions(src: string, cls: string, method: string): FunctionBody[] {
  const re = new RegExp(`\\b${cls}::${method}\\s*\\(`, 'g');
  const out: FunctionBody[] = [];
  for (const m of src.matchAll(re)) {
    let i = m.index! + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    const rest = /^\s*(?:const\s*)?(?:override\s*)?\{/.exec(src.slice(i));
    if (!rest) continue; // a call, not a definition
    const open = i + rest[0].length - 1;
    const close = matchBrace(src, open);
    out.push({ name: `${cls}::${method}`, open, close, line: lineAt(src, m.index!) });
  }
  return out;
}

export function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  return src.length - 1;
}

export interface KeyRef {
  enumName: string;
  line: number;
}

const KEY_VARS = '(?:attrKeyId|eventTypeId|styleKey|stylePropNameId|propNameId|keyId)';

/**
 * Keyword ids a function body dispatches on: `case K_X:` of outermost switch statements (nested
 * switches usually parse values, not keys) plus `<keyVar> ==|!= K_X` comparisons.
 */
export function dispatchedKeys(src: string, body: FunctionBody, strict = false): KeyRef[] {
  const text = src.slice(body.open, body.close + 1);
  const base = body.open;
  const out: KeyRef[] = [];
  const tokens = /\bswitch\s*\(\s*([^)]*?)\s*\)|\bcase\s+(K_[A-Z0-9_]+)\s*:|\{|\}/g;
  const keyVar = new RegExp(`^${KEY_VARS}$`);
  // stack entries: 0 = plain block, 1 = counted switch, 2 = ignored switch
  const stack: number[] = [];
  let pending = 0;
  let switchDepth = 0;
  let counted = false;
  for (const m of text.matchAll(tokens)) {
    const t = m[0];
    if (t.startsWith('switch')) pending = !strict || keyVar.test(m[1] ?? '') ? 1 : 2;
    else if (t === '{') {
      stack.push(pending);
      if (pending) {
        switchDepth++;
        if (switchDepth === 1) counted = pending === 1;
      }
      pending = 0;
    } else if (t === '}') {
      if (stack.pop()) switchDepth--;
    } else if (m[2] && switchDepth === 1 && counted) {
      out.push({ enumName: m[2], line: lineAt(src, base + m.index!) });
    }
  }
  const cmp = new RegExp(`\\b${KEY_VARS}\\s*[!=]=\\s*(K_[A-Z0-9_]+)`, 'g');
  for (const m of text.matchAll(cmp)) {
    if (m[1] === 'K_UNKNOWN') continue;
    out.push({ enumName: m[1]!, line: lineAt(src, base + m.index!) });
  }
  return out;
}

/** `const char * const X::NAME = "str";` / `constexpr char NAME[] = "str";` → map NAME → str. */
export function stringConstants(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(?:(\w+)::)?(\w+)\s*(?:\[\s*\])?\s*=\s*"([^"]*)"\s*;/g;
  for (const m of src.matchAll(re)) map.set(m[2]!, m[3]!);
  return map;
}
