/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { checkEs5, checkExpressionEs5, REGENERATOR } from './es5';

const features = (code: string): string[] => checkEs5(code).findings.map((f) => f.feature);

describe('checkEs5 (FR-LANG-007, ES5.1 profile)', () => {
  it('accepts an ES5.1 page with ES module import/export', () => {
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
      'regular expression flags u/y/s',
      'unicode code point escapes',
    ]);
    expect(features('function f() { return new.target; }')).toEqual(["'new.target'"]);
    expect(features('/a/d; /a/s;')).toEqual(['regular expression flag d', 'regular expression flags u/y/s']);
  });
  it('splits findings into transpilable and untranspilable tiers', () => {
    const tiers = (code: string): string[] => checkEs5(code).findings.map((f) => `${f.feature}:${f.tier}`);
    expect(tiers('let a = () => `x`; class C {} var {b} = o; for (var x of y) {}')).toEqual([
      "'let' declarations:transpilable",
      'arrow functions:transpilable',
      'template literals:transpilable',
      'classes:transpilable',
      'destructuring:transpilable',
      'for...of:transpilable',
    ]);
    const hard = checkEs5('async function f() {} function* g() {} 1n; /x/d;').findings;
    expect(hard.map((f) => f.tier)).toEqual([
      'untranspilable',
      'untranspilable',
      'untranspilable',
      'untranspilable',
    ]);
    expect(hard[0]!.reason).toBe(REGENERATOR);
    expect(hard[2]!.reason).toMatch(/BigInt/);
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
      tier: 'transpilable',
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
