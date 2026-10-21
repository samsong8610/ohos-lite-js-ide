/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse as parseLoose } from 'acorn-loose';

/** Symbols of a page's `export default { … }` ViewModel (ARCHITECTURE §7.1 ViewModel extractor). */
export interface ViewModelSymbols {
  data: string[];
  computed: string[];
  props: string[];
  methods: string[];
  lifecycle: string[];
}

/** Page / app lifecycle hooks of the lite JS framework: not offered as event handlers. */
export const LIFECYCLE_HOOKS = new Set([
  'onInit',
  'onReady',
  'onShow',
  'onHide',
  'onDestroy',
  'onCreate',
  'onBackPress',
]);

// Minimal ESTree shapes used here (acorn-loose returns plain objects).
interface Node {
  type: string;
  [k: string]: unknown;
}

const EMPTY = (): ViewModelSymbols => ({ data: [], computed: [], props: [], methods: [], lifecycle: [] });

function keyName(p: Node): string | undefined {
  if (p.type !== 'Property' || p['computed']) return undefined;
  const k = p['key'] as Node;
  if (k.type === 'Identifier') return k['name'] as string;
  if (k.type === 'Literal' && typeof k['value'] === 'string') return k['value'];
  return undefined;
}

function objectKeys(o: Node | undefined): string[] {
  if (!o || o.type !== 'ObjectExpression') return [];
  return (o['properties'] as Node[]).map(keyName).filter((k): k is string => !!k && k !== '✖');
}

const isFunction = (n: Node | undefined): boolean =>
  !!n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

/** `data: function () { return { a: 1 } }` → the returned object literal */
function returnedObject(fn: Node): Node | undefined {
  const body = fn['body'] as Node;
  if (body.type === 'ObjectExpression') return body;
  if (body.type !== 'BlockStatement') return undefined;
  for (const st of body['body'] as Node[]) {
    if (st.type === 'ReturnStatement') return (st['argument'] as Node | null) ?? undefined;
  }
  return undefined;
}

/** Resolves `export default x` / `module.exports = x` to an object literal (following one `var x = {…}`). */
function exportedObject(program: Node): Node | undefined {
  const body = program['body'] as Node[];
  let target: Node | undefined;
  for (const st of body) {
    if (st.type === 'ExportDefaultDeclaration') target = st['declaration'] as Node;
    else if (st.type === 'ExpressionStatement') {
      const e = st['expression'] as Node;
      const left = e['left'] as Node | undefined;
      if (
        e.type === 'AssignmentExpression' &&
        left?.type === 'MemberExpression' &&
        (left['object'] as Node)['name'] === 'module' &&
        (left['property'] as Node)['name'] === 'exports'
      ) {
        target = e['right'] as Node;
      }
    }
  }
  if (target?.type === 'Identifier') {
    const name = target['name'];
    for (const st of body) {
      if (st.type !== 'VariableDeclaration') continue;
      for (const d of st['declarations'] as Node[]) {
        if ((d['id'] as Node)['name'] === name) return (d['init'] as Node | null) ?? undefined;
      }
    }
    return undefined;
  }
  return target;
}

/**
 * Extracts data / computed / props / methods / lifecycle names. Uses a loose (error-tolerant) parser so
 * half-typed code still yields symbols; never throws.
 */
export function extractViewModel(code: string): ViewModelSymbols {
  let program: Node;
  try {
    program = parseLoose(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Node;
  } catch {
    return EMPTY();
  }
  const obj = exportedObject(program);
  const out = EMPTY();
  if (!obj || obj.type !== 'ObjectExpression') return out;
  for (const p of obj['properties'] as Node[]) {
    const name = keyName(p);
    if (!name) continue;
    const value = p['value'] as Node;
    if (name === 'data') {
      out.data.push(...objectKeys(isFunction(value) ? returnedObject(value) : value));
    } else if (name === 'computed') {
      out.computed.push(...objectKeys(value));
    } else if (name === 'props') {
      if (value.type === 'ArrayExpression') {
        for (const el of value['elements'] as Array<Node | null>)
          if (el?.type === 'Literal' && typeof el['value'] === 'string') out.props.push(el['value']);
      } else out.props.push(...objectKeys(value));
    } else if (isFunction(value)) {
      (LIFECYCLE_HOOKS.has(name) ? out.lifecycle : out.methods).push(name);
    }
  }
  return out;
}
