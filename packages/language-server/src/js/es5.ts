/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse, type Node, type Options } from 'acorn';

/** An ES2015+ construct the JerryScript ES5.1 profile cannot run (FR-LANG-007). */
export interface Es6Finding {
  feature: string;
  start: number;
  end: number;
}

type AnyNode = Node & Record<string, unknown>;

function isNode(v: unknown): v is AnyNode {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}

/** Depth-first visit of every ESTree node (acorn nodes carry only data fields). */
function visit(
  node: AnyNode,
  parent: AnyNode | undefined,
  fn: (n: AnyNode, parent: AnyNode | undefined) => void,
): void {
  fn(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (isNode(c)) visit(c, node, fn);
    } else if (isNode(v)) visit(v, node, fn);
  }
}

const ES2016_ASSIGN = new Set(['**=', '&&=', '||=', '??=']);

/** ES2015+ constructs in an ESTree AST. ES module syntax (import/export) is allowed: the build bundles it away. */
export function findEs6(ast: Node): Es6Finding[] {
  const out: Es6Finding[] = [];
  const add = (feature: string, n: { start: number; end: number }): void => {
    out.push({ feature, start: n.start, end: n.end });
  };
  visit(ast as AnyNode, undefined, (n, parent) => {
    switch (n.type) {
      case 'VariableDeclaration':
        if (n.kind !== 'var')
          add(`'${String(n.kind)}' declarations`, { start: n.start, end: n.start + String(n.kind).length });
        break;
      case 'ArrowFunctionExpression':
        add('arrow functions', n);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        add('classes', n);
        break;
      case 'TemplateLiteral':
        if (parent?.type !== 'TaggedTemplateExpression') add('template literals', n);
        break;
      case 'TaggedTemplateExpression':
        add('tagged templates', n);
        break;
      case 'ObjectPattern':
      case 'ArrayPattern':
        add('destructuring', n);
        break;
      case 'SpreadElement':
        add('spread syntax', n);
        break;
      case 'RestElement':
        add('rest parameters/elements', n);
        break;
      case 'AssignmentPattern':
        add('default values', n);
        break;
      case 'ForOfStatement':
        add('for...of', n);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        if (n.generator) add('generators', n);
        if (n.async) add('async functions', n);
        break;
      case 'Property':
        if (n.method) add('method shorthand', n);
        else if (n.shorthand && parent?.type === 'ObjectExpression') add('shorthand properties', n);
        if (n.computed) add('computed property names', n.key as AnyNode);
        break;
      case 'ChainExpression':
        add('optional chaining', n);
        break;
      case 'LogicalExpression':
        if (n.operator === '??') add('nullish coalescing', n);
        break;
      case 'BinaryExpression':
        if (n.operator === '**') add("exponentiation operator '**'", n);
        break;
      case 'AssignmentExpression':
        if (ES2016_ASSIGN.has(String(n.operator))) add(`'${String(n.operator)}' assignment`, n);
        break;
      case 'MetaProperty':
        add(`'${String((n.meta as AnyNode).name)}.${String((n.property as AnyNode).name)}'`, n);
        break;
      case 'ImportExpression':
        add('dynamic import()', n);
        break;
      case 'Literal': {
        const raw = String(n.raw ?? '');
        if (typeof n.bigint === 'string') add('BigInt literals', n);
        else if (/^0[bBoO]/.test(raw)) add('binary/octal literals', n);
        else if (typeof n.value === 'number' && raw.includes('_')) add('numeric separators', n);
        else if (n.regex && /[uysd]/.test(String((n.regex as { flags: string }).flags)))
          add('regular expression flags u/y/s/d', n);
        else if (typeof n.value === 'string' && /\\u\{/.test(raw)) add('unicode code point escapes', n);
        break;
      }
    }
  });
  return out.sort((a, b) => a.start - b.start);
}

/** a module specifier: `import x from '…'`, `require('…')` or `requireNative('…')` */
export interface ModuleRef {
  specifier: string;
  /** range of the string literal including its quotes */
  start: number;
  end: number;
}

/** Module specifiers referenced by an ESTree AST. */
export function moduleRefs(ast: Node): ModuleRef[] {
  const out: ModuleRef[] = [];
  const lit = (n: unknown): void => {
    if (isNode(n) && n.type === 'Literal' && typeof n.value === 'string')
      out.push({ specifier: n.value, start: n.start, end: n.end });
  };
  visit(ast as AnyNode, undefined, (n) => {
    if (
      n.type === 'ImportDeclaration' ||
      n.type === 'ExportNamedDeclaration' ||
      n.type === 'ExportAllDeclaration'
    )
      lit(n.source);
    else if (n.type === 'CallExpression') {
      const callee = n.callee as AnyNode;
      const args = n.arguments as unknown[];
      if (callee.type === 'Identifier' && (callee.name === 'require' || callee.name === 'requireNative'))
        lit(args[0]);
    }
  });
  return out;
}

export interface Es5CheckResult {
  findings: Es6Finding[];
  modules: ModuleRef[];
  comments: Array<{ text: string; start: number; end: number }>;
  /** the file does not parse even as ES2022+ (the TS server already reports syntax errors) */
  syntaxError?: string;
}

/** Checks a page/app .js file against ES5.1 (module syntax allowed). */
export function checkEs5(code: string): Es5CheckResult {
  const comments: Es5CheckResult['comments'] = [];
  const base: Options = {
    ecmaVersion: 'latest',
    allowHashBang: true,
    allowReturnOutsideFunction: true,
    onComment: (_block: boolean, text: string, start: number, end: number) =>
      comments.push({ text, start, end }),
  };
  let ast: Node;
  try {
    ast = parse(code, { ...base, sourceType: 'module' });
  } catch {
    comments.length = 0;
    try {
      ast = parse(code, { ...base, sourceType: 'script' });
    } catch (e) {
      return { findings: [], modules: [], comments, syntaxError: (e as Error).message };
    }
  }
  return { findings: findEs6(ast), modules: moduleRefs(ast), comments };
}

/** Checks one `{{ }}` expression body; offsets are relative to `expr`. Unparseable (half-typed) text yields []. */
export function checkExpressionEs5(expr: string): Es6Finding[] {
  // `for="{{(i, v) in list}}"` / `{{v in list}}`: only the iterable is an expression
  const loop = /^(\s*(?:\(\s*[\w$]+\s*,\s*[\w$]+\s*\)|[\w$]+)\s+in\s+)/.exec(expr);
  const skip = loop ? loop[1]!.length : 0;
  const body = expr.slice(skip);
  if (!body.trim()) return [];
  let ast: Node;
  try {
    ast = parse(`(${body}\n)`, { ecmaVersion: 'latest' });
  } catch {
    return [];
  }
  const shift = skip - 1;
  return findEs6(ast).map((f) => ({
    ...f,
    start: Math.max(skip, f.start + shift),
    end: Math.min(expr.length, f.end + shift),
  }));
}
