/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  conditionsByLine,
  dispatchedKeys,
  findFunctions,
  lineAt,
  requiredFeature,
  stringConstants,
  stripComments,
} from './cpp';

export interface Evidence {
  file: string;
  line: number;
}

export interface ImplFact {
  /** keyword enum, e.g. K_SCROLLPAGE */
  enumName: string;
  evidence: Evidence;
  feature?: string;
}

export interface MethodFact {
  name: string;
  evidence: Evidence;
  feature?: string;
}

export interface ImplScan {
  implClass: string;
  attributes: ImplFact[];
  styles: ImplFact[];
  events: ImplFact[];
  methods: MethodFact[];
  warnings: string[];
}

export interface SourceFile {
  /** path relative to the source repository root (used as evidence) */
  rel: string;
  text: string;
}

const PRIVATE = {
  attributes: ['SetPrivateAttribute'],
  styles: ['ApplyPrivateStyle'],
  events: ['RegisterPrivateEventListener'],
} as const;

export const COMMON = {
  attributes: ['SetCommonAttribute'],
  styles: ['ApplyCommonStyle'],
  events: ['RegisterCommonEventListener'],
} as const;

type Kind = keyof typeof PRIVATE;

function scanFns(
  file: SourceFile,
  src: string,
  conds: string[][],
  cls: string,
  fns: readonly string[],
): ImplFact[] {
  const out: ImplFact[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  const visit = (fnName: string, depth: number): void => {
    if (visited.has(fnName) || depth > 3) return;
    visited.add(fnName);
    for (const body of findFunctions(src, cls, fnName)) {
      for (const k of dispatchedKeys(src, body, depth > 0)) {
        if (seen.has(k.enumName)) continue;
        seen.add(k.enumName);
        const feature = requiredFeature(conds[k.line] ?? []);
        out.push({
          enumName: k.enumName,
          evidence: { file: file.rel, line: k.line },
          ...(feature ? { feature } : {}),
        });
      }
      // follow same-class helpers that are handed the style / attribute item (e.g. NativeViewSetDirection)
      const text = src.slice(body.open, body.close + 1);
      for (const c of text.matchAll(/\b([A-Z]\w*)\s*\(([^()]*)\)/g)) {
        if (/\b(style|attrKeyId|stylePropNameId|eventTypeId|attrValue)\b/.test(c[2]!))
          visit(c[1]!, depth + 1);
      }
    }
  };
  for (const fnName of fns) visit(fnName, 0);
  return out;
}

/**
 * ComponentImplScanner (ARCHITECTURE §7.4 P3): keys dispatched in SetPrivateAttribute / ApplyPrivateStyle /
 * RegisterPrivateEventListener and methods registered with RegisterNamedFunction.
 */
export function scanComponentImpl(
  cls: string,
  file: SourceFile,
  constants: Map<string, string>,
  fnSet: Record<Kind, readonly string[]> = PRIVATE,
): ImplScan {
  const src = stripComments(file.text);
  const conds = conditionsByLine(src);
  const local = new Map([...constants, ...stringConstants(src)]);
  const warnings: string[] = [];
  const methods: MethodFact[] = [];
  const methodMap = parseMethodMap(src, local);
  for (const m of src.matchAll(/RegisterNamedFunction\(\s*([^,]+?)\s*,/g)) {
    const expr = m[1]!;
    const line = lineAt(src, m.index!);
    if (/\b(const|char)\b/.test(expr)) continue; // the declaration itself
    let name: string | undefined;
    const lit = /^"([^"]+)"$/.exec(expr);
    const idx = /^methodMap_\[(\d+)\]\.methodName$/.exec(expr);
    if (lit) name = lit[1];
    else if (idx) name = methodMap[Number(idx[1])];
    else name = local.get(expr.replace(/^\w+::/, ''));
    if (!name) {
      warnings.push(`${file.rel}:${line}: cannot resolve method name "${expr}"`);
      continue;
    }
    const feature = requiredFeature(conds[line] ?? []);
    methods.push({ name, evidence: { file: file.rel, line }, ...(feature ? { feature } : {}) });
  }
  return {
    implClass: cls,
    attributes: scanFns(file, src, conds, cls, fnSet.attributes),
    styles: scanFns(file, src, conds, cls, fnSet.styles),
    events: scanFns(file, src, conds, cls, fnSet.events),
    methods,
    warnings,
  };
}

/** `const MethodMap X::methodMap_[] = { {"a", Fn}, {CONST, Fn} };` → ordered method names */
function parseMethodMap(src: string, constants: Map<string, string>): string[] {
  const m = /methodMap_\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/.exec(src);
  if (!m) return [];
  return [...m[1]!.matchAll(/\{\s*([^,}]+?)\s*,/g)].map((e) => {
    const t = e[1]!;
    const lit = /^"([^"]+)"$/.exec(t);
    return lit ? lit[1]! : (constants.get(t.replace(/^\w+::/, '')) ?? t);
  });
}
