/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse, type Node, type Options } from 'acorn';

/**
 * An ES2015+ construct, classified against the device engine (third_party/jerryscript 2.3 built with
 * JERRY_ES2015 = 1, identical in OpenHarmony 5.0.3 and 6.1) and against ace-loader's lite babel
 * (preset-env, no targets, plus @babel/plugin-transform-runtime). ARCHITECTURE §7.1 "ES 语法诊断".
 */
export interface Es6Finding {
  feature: string;
  /** the device engine parses and runs it natively */
  engine: boolean;
  /** what ace-loader's babel does with it in page scripts */
  babel: BabelOutcome;
  /** why it fails (shown in diagnostics) */
  reason?: string;
  start: number;
  end: number;
}

/** `lowers`: plain ES5 output; `regenerator`: output runs on @babel/runtime regenerator; `cannot`: no transform */
export type BabelOutcome = 'lowers' | 'regenerator' | 'cannot';

/** Tier of a finding in a page `.js` file (babel runs): `ok` = not reported. */
export type Es6Tier = 'ok' | 'transpilable' | 'untranspilable';

export function jsTier(f: Pick<Es6Finding, 'engine' | 'babel'>): Es6Tier {
  if (f.babel === 'cannot' || f.babel === 'regenerator') return 'untranspilable';
  return f.engine ? 'ok' : 'transpilable';
}

export interface FindEs6Options {
  /** RegExp is built into the device engine (js-capabilities.json); regex literals fail to parse otherwise */
  regexp?: boolean;
}

export type AnyNode = Node & Record<string, unknown>;

function isNode(v: unknown): v is AnyNode {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}

/** Depth-first visit of every ESTree node (acorn nodes carry only data fields). */
export function visit(
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

/** why async functions and generators are errors in page scripts (Q24, pending device verification) */
export const REGENERATOR =
  'babel turns it into @babel/runtime regenerator code; on a host build of the device JerryScript that bundle crashed while JERRY_FUNCTION_BACKTRACE was on (the device build sets it), so it is unverified on the device (ARCHITECTURE Q24)';

const NOT_ENGINE = 'the device JerryScript engine (2.3, ES2015 profile) cannot parse it';

/** ES2015+ constructs in an ESTree AST. ES module syntax (import/export) is allowed: the build bundles it away. */
export function findEs6(ast: Node, options: FindEs6Options = {}): Es6Finding[] {
  const out: Es6Finding[] = [];
  const at = (n: { start: number; end: number }) => ({ start: n.start, end: n.end });
  /** ES2015 (+ `**`): the engine runs it, babel lowers it */
  const es2015 = (feature: string, n: { start: number; end: number }): void => {
    out.push({ feature, engine: true, babel: 'lowers', ...at(n) });
  };
  /** newer than the engine; babel lowers it to ES5 */
  const newer = (feature: string, n: { start: number; end: number }): void => {
    out.push({ feature, engine: false, babel: 'lowers', reason: NOT_ENGINE, ...at(n) });
  };
  const regen = (
    feature: string,
    n: { start: number; end: number },
    engine: boolean,
    reason: string,
  ): void => {
    out.push({ feature, engine, babel: 'regenerator', reason, ...at(n) });
  };
  const never = (feature: string, n: { start: number; end: number }, reason: string): void => {
    out.push({ feature, engine: false, babel: 'cannot', reason, ...at(n) });
  };
  const ASYNC_ENGINE =
    'the device engine parses async functions but its await does not unwrap promises (verified on a host build)';
  visit(ast as AnyNode, undefined, (n, parent) => {
    switch (n.type) {
      case 'VariableDeclaration':
        if (n.kind !== 'var')
          es2015(`'${String(n.kind)}' declarations`, {
            start: n.start,
            end: n.start + String(n.kind).length,
          });
        break;
      case 'ArrowFunctionExpression':
        es2015('arrow functions', n);
        if (n.async) regen('async functions', n, false, ASYNC_ENGINE);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        es2015('classes', n);
        break;
      case 'PropertyDefinition':
        newer('class fields', n);
        break;
      case 'PrivateIdentifier':
        if (parent?.type !== 'PropertyDefinition') newer('private class members', n);
        break;
      case 'StaticBlock':
        newer('class static blocks', n);
        break;
      case 'TemplateLiteral':
        if (parent?.type !== 'TaggedTemplateExpression') es2015('template literals', n);
        break;
      case 'TaggedTemplateExpression':
        es2015('tagged templates', n);
        break;
      case 'ObjectPattern':
      case 'ArrayPattern':
        es2015('destructuring', n);
        break;
      case 'SpreadElement':
        if (parent?.type === 'ObjectExpression') newer('object spread', n);
        else es2015('spread syntax', n);
        break;
      case 'RestElement':
        if (parent?.type === 'ObjectPattern') newer('object rest properties', n);
        else es2015('rest parameters/elements', n);
        break;
      case 'AssignmentPattern':
        es2015('default values', n);
        break;
      case 'ForOfStatement':
        if (n.await) never('for await...of', n, NOT_ENGINE);
        else es2015('for...of', n);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        if (n.generator && n.async) regen('async generators', n, false, ASYNC_ENGINE);
        else if (n.generator) regen('generators', n, true, REGENERATOR);
        else if (n.async) regen('async functions', n, false, ASYNC_ENGINE);
        break;
      case 'CatchClause':
        if (!n.param) newer('optional catch binding', n);
        break;
      case 'Property':
        if (n.method) es2015('method shorthand', n);
        else if (n.shorthand && parent?.type === 'ObjectExpression') es2015('shorthand properties', n);
        if (n.computed) es2015('computed property names', n.key as AnyNode);
        break;
      case 'ChainExpression':
        newer('optional chaining', n);
        break;
      case 'LogicalExpression':
        if (n.operator === '??') newer('nullish coalescing', n);
        break;
      case 'BinaryExpression':
        if (n.operator === '**') es2015("exponentiation operator '**'", n);
        break;
      case 'AssignmentExpression':
        if (n.operator === '**=') es2015("'**=' assignment", n);
        else if (LOGICAL_ASSIGN.has(String(n.operator))) newer(`'${String(n.operator)}' assignment`, n);
        break;
      case 'MetaProperty':
        if ((n.meta as AnyNode).name === 'new') es2015("'new.target'", n);
        else newer(`'${String((n.meta as AnyNode).name)}.${String((n.property as AnyNode).name)}'`, n);
        break;
      case 'ImportExpression':
        newer('dynamic import()', n);
        break;
      case 'Literal': {
        const raw = String(n.raw ?? '');
        if (typeof n.bigint === 'string')
          never('BigInt literals', n, 'babel cannot lower BigInt and the engine has no BigInt');
        else if (n.regex) {
          if (options.regexp === false)
            never(
              'regular expression literals',
              n,
              'RegExp is compiled out of the device engine (JERRY_BUILTIN_REGEXP = 0), so the file fails to parse',
            );
          else if (/d/.test(String((n.regex as { flags: string }).flags)))
            never('regular expression flag d', n, 'no babel transform exists for match indices');
        } else if (/^0[bBoO]/.test(raw)) es2015('binary/octal literals', n);
        else if (typeof n.value === 'number' && raw.includes('_')) newer('numeric separators', n);
        else if (typeof n.value === 'string' && /\\u\{/.test(raw)) es2015('unicode code point escapes', n);
        break;
      }
    }
  });
  return out.sort((a, b) => a.start - b.start);
}

const LOGICAL_ASSIGN = new Set(['&&=', '||=', '??=']);

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
  /** the parsed program (absent on syntax errors), reused by other JS rules */
  ast?: Node;
}

/** Checks a page/app .js file against the device engine and babel (module syntax allowed). */
export function checkEs5(code: string, options: FindEs6Options = {}): Es5CheckResult {
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
  return { findings: findEs6(ast, options), modules: moduleRefs(ast), comments, ast };
}

/** A template expression construct that ace-loader's parseExpression (plugin/templater/content.js) breaks. */
export interface RewriteFinding {
  feature: string;
  reason: string;
  start: number;
  end: number;
}

function parseTemplateExpression(expr: string): { ast: Node; skip: number } | undefined {
  // `for="{{(i, v) in list}}"` / `{{v in list}}`: only the iterable is an expression
  const loop = /^(\s*(?:\(\s*[\w$]+\s*,\s*[\w$]+\s*\)|[\w$]+)\s+in\s+)/.exec(expr);
  const skip = loop ? loop[1]!.length : 0;
  const body = expr.slice(skip);
  if (!body.trim()) return undefined;
  try {
    return { ast: parse(`(${body}\n)`, { ecmaVersion: 'latest' }), skip };
  } catch {
    return undefined;
  }
}

function shiftInto<T extends { start: number; end: number }>(f: T, skip: number, len: number): T {
  const shift = skip - 1;
  return { ...f, start: Math.max(skip, f.start + shift), end: Math.min(len, f.end + shift) };
}

/** Checks one `{{ }}` expression body; offsets are relative to `expr`. Unparseable (half-typed) text yields []. */
export function checkExpressionEs5(expr: string, options: FindEs6Options = {}): Es6Finding[] {
  const p = parseTemplateExpression(expr);
  return p ? findEs6(p.ast, options).map((f) => shiftInto(f, p.skip, expr.length)) : [];
}

const PARAM_REWRITE =
  "ace-loader's template compiler rewrites every identifier to this.<name>, so the body reads the ViewModel instead of the parameter";
const PATTERN_REWRITE =
  'ace-loader\'s template compiler rewrites the names inside the pattern to this.<name>; the build fails ("Illegal property in declaration context")';
const SHORTHAND_REWRITE =
  "ace-loader's template compiler turns {a} into {this.a}; the build fails (\"Unexpected token '.'\")";

/**
 * Template constructs that parseExpression (identifier → `this.x`, no scope analysis) breaks, verified by
 * building with ace-loader 5.0.3: function parameters used in their body, destructuring parameters, and
 * shorthand object properties.
 */
export function checkExpressionRewrites(expr: string): RewriteFinding[] {
  const p = parseTemplateExpression(expr);
  if (!p) return [];
  const out: RewriteFinding[] = [];
  visit(p.ast as AnyNode, undefined, (n, parent) => {
    if (n.type === 'Property' && n.shorthand && !n.method && parent?.type === 'ObjectExpression')
      out.push({ feature: 'shorthand property', reason: SHORTHAND_REWRITE, start: n.start, end: n.end });
    if (n.type !== 'ArrowFunctionExpression' && n.type !== 'FunctionExpression') return;
    const names = new Set<string>();
    for (const param of n.params as AnyNode[]) {
      const id = param.type === 'AssignmentPattern' ? (param.left as AnyNode) : param;
      if (id.type === 'Identifier') names.add(String(id.name));
      else
        out.push({
          feature: 'destructuring parameter',
          reason: PATTERN_REWRITE,
          start: param.start,
          end: param.end,
        });
    }
    if (!names.size) return;
    visit(n.body as AnyNode, n, (x, xp) => {
      if (x.type !== 'Identifier' || !names.has(String(x.name))) return;
      // `x => x`: an identifier that is the whole arrow body is left alone by the rewriter
      if (xp === n) return;
      if (xp?.type === 'MemberExpression' && xp.property === x && !xp.computed) return;
      if (xp?.type === 'Property' && xp.key === x && !xp.computed && !xp.shorthand) return;
      out.push({
        feature: `parameter '${String(x.name)}'`,
        reason: PARAM_REWRITE,
        start: x.start,
        end: x.end,
      });
    });
  });
  return out.sort((a, b) => a.start - b.start).map((f) => shiftInto(f, p.skip, expr.length));
}
