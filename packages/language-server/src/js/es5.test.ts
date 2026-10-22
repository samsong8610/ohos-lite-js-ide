/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { checkEs5, checkExpressionEs5, checkExpressionRewrites, jsTier, REGENERATOR } from './es5';

const features = (code: string): string[] => checkEs5(code).findings.map((f) => f.feature);

describe('checkEs5 (FR-LANG-007, device engine profile)', () => {
  it('accepts a plain ES5 page with ES module import/export', () => {
    const r = checkEs5(`import router from '@system.router';
export default {
  data: { a: 1, list: [1, 2] },
  get total() { return 1; },
  tap: function (e) { var self = this; router.replace({ uri: 'pages/b/b' }); return /x/gi.test('' + 0x1F); }
};`);
    expect(r.findings).toEqual([]);
    expect(r.comments).toEqual([]);
    expect(r.modules.map((m) => m.specifier)).toEqual(['@system.router']);
  });
  it('reports each ES2015+ construct with its range', () => {
    const code = 'let a = 1;\nconst f = (x) => `v${x}`;';
    const r = checkEs5(code);
    expect(r.findings.map((f) => [f.feature, code.slice(f.start, f.end)])).toEqual([
      ["'let' declarations", 'let'],
      ["'const' declarations", 'const'],
      ['arrow functions', '(x) => `v${x}`'],
      ['template literals', '`v${x}`'],
    ]);
  });
  it('covers the ES2015–ES2022 feature list', () => {
    expect(features('class A {}; var B = class {};')).toEqual(['classes', 'classes']);
    expect(features('var {a} = o; var [b] = c; function f({x}) {}')).toEqual([
      'destructuring',
      'destructuring',
      'destructuring',
    ]);
    expect(features('f(...a); function g(...r) {} var o = {a, b() {}, [k]: 1};')).toEqual([
      'spread syntax',
      'rest parameters/elements',
      'shorthand properties',
      'method shorthand',
      'computed property names',
    ]);
    expect(features('function f(a = 1) {} for (var x of y) {}')).toEqual(['default values', 'for...of']);
    expect(features('function* g() { yield 1; } async function h() { await 1; }')).toEqual([
      'generators',
      'async functions',
    ]);
    expect(
      features(
        'var a = async () => 1; async function* g() {} async function f() { for await (var x of y) {} }',
      ),
    ).toEqual([
      'arrow functions',
      'async functions',
      'async generators',
      'async functions',
      'for await...of',
    ]);
    expect(features('a?.b; a ?? b; a ** 2; a **= 2; a ||= b; tag`x`;')).toEqual([
      'optional chaining',
      'nullish coalescing',
      "exponentiation operator '**'",
      "'**=' assignment",
      "'||=' assignment",
      'tagged templates',
    ]);
    expect(features('import("x"); 10n; 0b1; 0o7; 1_000; /a/u; "\\u{1F600}";')).toEqual([
      'dynamic import()',
      'BigInt literals',
      'binary/octal literals',
      'binary/octal literals',
      'numeric separators',
      'unicode code point escapes',
    ]);
    expect(features('function f() { return new.target; }')).toEqual(["'new.target'"]);
    expect(features('/a/d; /a/s;')).toEqual(['regular expression flag d']);
    expect(checkEs5('/a/; "x";', { regexp: false }).findings.map((f) => f.feature)).toEqual([
      'regular expression literals',
    ]);
    expect(
      features(
        'var o = {...a}; var {x, ...r} = o; try {} catch {} class K { f = 1; #p() {} static {} } a.b = import.meta;',
      ),
    ).toEqual([
      'object spread',
      'destructuring',
      'object rest properties',
      'optional catch binding',
      'classes',
      'class fields',
      'private class members',
      'class static blocks',
      "'import.meta'",
    ]);
  });
  it('classifies against the device engine (JerryScript 2.3, ES2015) and babel', () => {
    const tiers = (code: string): string[] => checkEs5(code).findings.map((f) => `${f.feature}:${jsTier(f)}`);
    // ES2015 and `**` run natively: not reported in .js
    expect(
      tiers('let a = () => `x`; class C {} var {b} = o; for (var x of y) {} a ** 2; a **= 2; f(...l);'),
    ).toEqual([
      "'let' declarations:ok",
      'arrow functions:ok',
      'template literals:ok',
      'classes:ok',
      'destructuring:ok',
      'for...of:ok',
      "exponentiation operator '**':ok",
      "'**=' assignment:ok",
      'spread syntax:ok',
    ]);
    // newer than the engine, lowered by babel
    expect(tiers('a?.b; a ?? b; a ||= 1; 1_000; var o = {...p};')).toEqual([
      'optional chaining:transpilable',
      'nullish coalescing:transpilable',
      "'||=' assignment:transpilable",
      'numeric separators:transpilable',
      'object spread:transpilable',
    ]);
    // regenerator output or no transform
    const hard = checkEs5(
      'async function f() {} function* g() {} 1n; /x/d; async function h() { for await (var v of w) {} }',
    ).findings;
    expect(hard.map((f) => `${f.feature}:${jsTier(f)}:${f.engine}`)).toEqual([
      'async functions:untranspilable:false',
      'generators:untranspilable:true',
      'BigInt literals:untranspilable:false',
      'regular expression flag d:untranspilable:false',
      'async functions:untranspilable:false',
      'for await...of:untranspilable:false',
    ]);
    expect(hard[1]!.reason).toBe(REGENERATOR);
    expect(hard[0]!.reason).toMatch(/await does not unwrap/);
    expect(features('async function* g() {} var h = async () => 1;')).toEqual([
      'async generators',
      'arrow functions',
      'async functions',
    ]);
  });
  it('scripts that are not valid modules, comments, and unparseable code', () => {
    const r = checkEs5('// ohjs-disable-next-line\nwith (o) { let x; }');
    expect(r.findings.map((f) => f.feature)).toEqual(["'let' declarations"]);
    expect(r.comments).toEqual([{ text: ' ohjs-disable-next-line', start: 0, end: 25 }]);
    const bad = checkEs5('var = ;');
    expect(bad.findings).toEqual([]);
    expect(bad.syntaxError).toMatch(/Unexpected token/);
  });
});

describe('checkExpressionEs5 ({{ }} bodies)', () => {
  it('maps offsets back into the expression', () => {
    const e = ' list.map(x => x.a) ';
    const [f] = checkExpressionEs5(e);
    expect(f!.feature).toBe('arrow functions');
    expect(e.slice(f!.start, f!.end)).toBe('x => x.a');
    expect(checkExpressionEs5('`a${b}`')[0]).toEqual({
      feature: 'template literals',
      engine: true,
      babel: 'lowers',
      start: 0,
      end: 7,
    });
  });
  it('ES5 expressions, for-loop headers and half-typed text are fine', () => {
    expect(checkExpressionEs5(" a ? $t('k') : b.c[0] + 1 ")).toEqual([]);
    expect(checkExpressionEs5('(i, v) in list')).toEqual([]);
    expect(checkExpressionEs5('v in list')).toEqual([]);
    const loop = '(i, v) in a?.b';
    const [f] = checkExpressionEs5(loop);
    expect(loop.slice(f!.start, f!.end)).toBe('a?.b');
    expect(checkExpressionEs5('a +')).toEqual([]);
    expect(checkExpressionEs5('  ')).toEqual([]);
    expect(checkExpressionEs5('v in ')).toEqual([]);
  });
});

describe('moduleRefs', () => {
  it('import/export-from, require and requireNative literals with quote-inclusive ranges', () => {
    const code =
      "import a from '@system.app';\nexport { x } from './x';\nexport * from './y';\nvar r = require('@system.router');\nvar n = requireNative('system.prompt');\nrequire(dyn); foo('@system.no');";
    const r = checkEs5(code);
    expect(r.modules.map((m) => [m.specifier, code.slice(m.start, m.end)])).toEqual([
      ['@system.app', "'@system.app'"],
      ['./x', "'./x'"],
      ['./y', "'./y'"],
      ['@system.router', "'@system.router'"],
      ['system.prompt', "'system.prompt'"],
    ]);
    expect(checkEs5('var = ;').modules).toEqual([]);
  });
});

describe('checkExpressionRewrites (ace-loader parseExpression: identifier -> this.x)', () => {
  const show = (e: string): string[] =>
    checkExpressionRewrites(e).map((f) => `${f.feature}@${e.slice(f.start, f.end)}`);
  it('flags parameters read in the body, destructuring parameters and shorthand properties', () => {
    expect(show('list.map(x => x.a)')).toEqual(["parameter 'x'@x"]);
    expect(show('list.reduce((s, v = 1) => s + v, 0)')).toEqual(["parameter 's'@s", "parameter 'v'@v"]);
    expect(show('list.filter(function (x) { return x > 1 })')).toEqual(["parameter 'x'@x"]);
    expect(show('items.map(({a}) => a)')).toEqual(['destructuring parameter@{a}']);
    expect(show('{ a, b: c }')).toEqual(['shorthand property@a']);
    expect(checkExpressionRewrites('{a}')[0]!.reason).toMatch(/Unexpected token/);
    expect(checkExpressionRewrites('f(({a}) => 1)')[0]!.reason).toMatch(/Illegal property/);
    expect(checkExpressionRewrites('f(x => x.a)')[0]!.reason).toMatch(/this\.<name>/);
  });
  it('leaves what the rewriter keeps intact', () => {
    expect(show('f(x => x)')).toEqual([]);
    expect(show('list.map(x => 1)')).toEqual([]);
    expect(show('list.map(x => y.x + o[x0])')).toEqual([]);
    expect(show('list.map(x => ({ x: 1 }))')).toEqual([]);
    expect(show('`t${a}` + a ** 2')).toEqual([]);
    expect(show('(i, v) in list.map(q => q.n)')).toEqual(["parameter 'q'@q"]);
    expect(show('a +')).toEqual([]);
    expect(show('   ')).toEqual([]);
  });
});
