/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Node } from 'acorn';
import { visit, type AnyNode } from './es5';

/**
 * Built-in APIs of the small-system JerryScript runtime (third_party/jerryscript, OpenHarmony 5.0.3 and
 * master are identical). ace-loader's lite babel config is preset-env with no `useBuiltIns`/core-js, so
 * nothing here is polyfilled: an API is usable exactly when the engine build has it.
 *
 * Evidence: `engine.gni` build args (jerryscript_jerry_es2015 = 1; Promise/Map/Set/Proxy/TypedArray = 1;
 * WeakMap/WeakSet/DataView/Reflect = 0) and the routine tables in `jerry-core/ecma/builtin-objects/*.inc.h`.
 * Add an entry here (with its source) when the engine or the build args change.
 */
export interface BuiltinEntry {
  /** `Name` for a global, `Owner.name` for a static, `Owner.prototype.name` for a method */
  name: string;
  since: string;
  /** why it is missing on the device */
  reason: string;
}

const OFF_ARG = (arg: string): string => `compiled out of the device engine (engine.gni ${arg} = 0)`;
const NOT_IMPL = 'not implemented by the device JerryScript engine';

/** Blacklist: reported as `js/unsupported-builtin`. */
export const UNSUPPORTED_BUILTINS: readonly BuiltinEntry[] = [
  { name: 'WeakMap', since: 'ES2015', reason: OFF_ARG('jerryscript_jerry_es2015_builtin_weakmap') },
  { name: 'WeakSet', since: 'ES2015', reason: OFF_ARG('jerryscript_jerry_es2015_builtin_weakset') },
  { name: 'DataView', since: 'ES2015', reason: OFF_ARG('jerryscript_jerry_es2015_builtin_dataview') },
  { name: 'Reflect', since: 'ES2015', reason: OFF_ARG('jerryscript_jerry_es2015_builtin_reflect') },
  { name: 'BigInt', since: 'ES2020', reason: NOT_IMPL },
  { name: 'globalThis', since: 'ES2020', reason: NOT_IMPL },
  { name: 'WeakRef', since: 'ES2021', reason: NOT_IMPL },
  { name: 'FinalizationRegistry', since: 'ES2021', reason: NOT_IMPL },
  { name: 'AggregateError', since: 'ES2021', reason: NOT_IMPL },
  { name: 'SharedArrayBuffer', since: 'ES2017', reason: NOT_IMPL },
  { name: 'Atomics', since: 'ES2017', reason: NOT_IMPL },
  { name: 'Object.entries', since: 'ES2017', reason: NOT_IMPL },
  { name: 'Object.values', since: 'ES2017', reason: NOT_IMPL },
  { name: 'Object.fromEntries', since: 'ES2019', reason: NOT_IMPL },
  { name: 'Object.getOwnPropertyDescriptors', since: 'ES2017', reason: NOT_IMPL },
  { name: 'Promise.allSettled', since: 'ES2020', reason: NOT_IMPL },
  { name: 'Promise.any', since: 'ES2021', reason: NOT_IMPL },
  { name: 'Symbol.asyncIterator', since: 'ES2018', reason: NOT_IMPL },
  { name: 'Array.prototype.includes', since: 'ES2016', reason: `${NOT_IMPL} (String.prototype.includes is)` },
  { name: 'Array.prototype.flat', since: 'ES2019', reason: NOT_IMPL },
  { name: 'Array.prototype.flatMap', since: 'ES2019', reason: NOT_IMPL },
  { name: 'String.prototype.padStart', since: 'ES2017', reason: NOT_IMPL },
  { name: 'String.prototype.padEnd', since: 'ES2017', reason: NOT_IMPL },
  { name: 'String.prototype.trimStart', since: 'ES2019', reason: NOT_IMPL },
  { name: 'String.prototype.trimEnd', since: 'ES2019', reason: NOT_IMPL },
  { name: 'String.prototype.matchAll', since: 'ES2020', reason: NOT_IMPL },
  { name: 'String.prototype.replaceAll', since: 'ES2021', reason: NOT_IMPL },
  { name: 'String.prototype.normalize', since: 'ES2015', reason: NOT_IMPL },
  { name: 'Promise.prototype.finally', since: 'ES2018', reason: NOT_IMPL },
];

/**
 * Whitelist: ES2015 built-ins the device engine does have (JERRY_ES2015 = 1), so they are never reported.
 * Kept explicit so a reviewer can see each decision and tests can pin it.
 */
export const SUPPORTED_ES2015_BUILTINS: readonly string[] = [
  'Symbol',
  'Promise',
  'Map',
  'Set',
  'Proxy',
  'ArrayBuffer',
  'Uint8Array',
  'Object.assign',
  'Object.is',
  'Object.setPrototypeOf',
  'Object.getOwnPropertySymbols',
  'Array.from',
  'Array.of',
  'Array.prototype.find',
  'Array.prototype.findIndex',
  'Array.prototype.fill',
  'Array.prototype.copyWithin',
  'String.fromCodePoint',
  'String.raw',
  'String.prototype.includes',
  'String.prototype.startsWith',
  'String.prototype.endsWith',
  'String.prototype.repeat',
  'String.prototype.codePointAt',
  'Number.isInteger',
  'Number.isNaN',
  'Number.isFinite',
  'Number.isSafeInteger',
  'Math.trunc',
  'Math.sign',
  'Math.cbrt',
  'Math.log2',
  'Math.hypot',
];

export interface BuiltinFinding {
  entry: BuiltinEntry;
  start: number;
  end: number;
}

const GLOBALS = new Map<string, BuiltinEntry>();
const STATICS = new Map<string, BuiltinEntry>();
const METHODS = new Map<string, BuiltinEntry>();
for (const e of UNSUPPORTED_BUILTINS) {
  const parts = e.name.split('.');
  if (parts.length === 1) GLOBALS.set(e.name, e);
  else if (parts[1] === 'prototype') METHODS.set(parts[2]!, e);
  else STATICS.set(e.name, e);
}

function declaredNames(ast: AnyNode): Set<string> {
  const out = new Set<string>();
  const id = (n: unknown): void => {
    const x = n as AnyNode | null | undefined;
    if (x?.type === 'Identifier') out.add(String(x.name));
  };
  visit(ast, undefined, (n) => {
    if (n.type === 'VariableDeclarator' || n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration')
      id(n.id);
    else if (
      n.type === 'ImportSpecifier' ||
      n.type === 'ImportDefaultSpecifier' ||
      n.type === 'ImportNamespaceSpecifier'
    )
      id(n.local);
    if (
      n.type === 'FunctionDeclaration' ||
      n.type === 'FunctionExpression' ||
      n.type === 'ArrowFunctionExpression'
    )
      for (const p of n.params as unknown[]) id(p);
  });
  return out;
}

function propName(m: AnyNode): string | undefined {
  const p = m.property as AnyNode;
  if (!m.computed && p.type === 'Identifier') return String(p.name);
  if (m.computed && p.type === 'Literal' && typeof p.value === 'string') return p.value;
  return undefined;
}

/**
 * Uses of blacklisted built-ins. Globals shadowed by a declaration in the file are skipped. Prototype
 * methods are matched by name on calls (`x.flat()`), except on `this` (ViewModel methods); for
 * `includes` only a receiver that is visibly an array (an array literal) counts, since strings have it.
 */
export function findUnsupportedBuiltins(ast: Node): BuiltinFinding[] {
  const root = ast as AnyNode;
  const declared = declaredNames(root);
  const arrays = new Set<string>();
  visit(root, undefined, (n) => {
    const id = n.id as AnyNode | undefined;
    if (
      n.type === 'VariableDeclarator' &&
      id?.type === 'Identifier' &&
      (n.init as AnyNode | null)?.type === 'ArrayExpression'
    )
      arrays.add(String(id.name));
  });
  const isArray = (o: AnyNode): boolean =>
    o.type === 'ArrayExpression' || (o.type === 'Identifier' && arrays.has(String(o.name)));
  const out: BuiltinFinding[] = [];
  visit(root, undefined, (n, parent) => {
    if (n.type === 'Identifier') {
      const e = GLOBALS.get(String(n.name));
      if (!e || declared.has(e.name)) return;
      if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
      if (parent?.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return;
      if (parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') return;
      out.push({ entry: e, start: n.start, end: n.end });
    } else if (n.type === 'MemberExpression') {
      const obj = n.object as AnyNode;
      const name = propName(n);
      if (!name) return;
      if (obj.type === 'Identifier' && !declared.has(String(obj.name))) {
        const e = STATICS.get(`${String(obj.name)}.${name}`);
        if (e) {
          out.push({ entry: e, start: n.start, end: n.end });
          return;
        }
      }
      const m = METHODS.get(name);
      if (!m || parent?.type !== 'CallExpression' || parent.callee !== n || obj.type === 'ThisExpression')
        return;
      if (name === 'includes' && !isArray(obj)) return;
      const p = n.property as AnyNode;
      out.push({ entry: m, start: p.start, end: n.end });
    }
  });
  return out.sort((a, b) => a.start - b.start);
}
