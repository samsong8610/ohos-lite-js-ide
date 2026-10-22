/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { checkEs5 } from './es5';
import { findUnsupportedBuiltins, SUPPORTED_ES2015_BUILTINS, UNSUPPORTED_BUILTINS } from './builtins';

const names = (code: string): string[] => {
  const r = checkEs5(code);
  return findUnsupportedBuiltins(r.ast!).map((f) => `${f.entry.name}@${code.slice(f.start, f.end)}`);
};

describe('built-in API black/white list (small-system JerryScript)', () => {
  it('lists are disjoint, unique and carry a reason', () => {
    const black = UNSUPPORTED_BUILTINS.map((e) => e.name);
    expect(new Set(black).size).toBe(black.length);
    expect(SUPPORTED_ES2015_BUILTINS.filter((n) => black.includes(n))).toEqual([]);
    for (const e of UNSUPPORTED_BUILTINS) {
      expect(e.reason.length).toBeGreaterThan(10);
      expect(e.since).toMatch(/^ES20\d\d$/);
    }
  });
  it('reports globals, statics and prototype methods', () => {
    expect(
      names(
        'var m = new WeakMap(); Reflect.ownKeys(o); globalThis.x; Object.entries(o); Promise.allSettled(p);' +
          ' s.padStart(2); a.flat(); p.finally(f); [1].includes(1); Symbol.asyncIterator;',
      ),
    ).toEqual([
      'WeakMap@WeakMap',
      'Reflect@Reflect',
      'globalThis@globalThis',
      'Object.entries@Object.entries',
      'Promise.allSettled@Promise.allSettled',
      'String.prototype.padStart@padStart',
      'Array.prototype.flat@flat',
      'Promise.prototype.finally@finally',
      'Array.prototype.includes@includes',
      'Symbol.asyncIterator@Symbol.asyncIterator',
    ]);
    expect(names("var list = [1, 2]; list.includes(1); list['flatMap'](f);")).toEqual([
      'Array.prototype.includes@includes',
      "Array.prototype.flatMap@'flatMap']",
    ]);
  });
  it('does not report the ES2015 built-ins the engine has (whitelist), shadowed names, keys or ViewModel methods', () => {
    expect(
      names(
        'Object.assign({}, a); new Promise(f); new Map(); new Set(); Symbol("x"); Array.from(a); Array.of(1);' +
          ' "ab".includes("a"); s.includes("a"); s.startsWith("a"); s.endsWith("a"); s.repeat(2); Number.isInteger(1);',
      ),
    ).toEqual([]);
    expect(
      names(
        'var Reflect = {}; Reflect.x; function f(WeakMap) { return WeakMap; } var o = { WeakMap: 1, flat: 2 }; o.WeakMap;' +
          ' export default { padStart() {}, go() { this.padStart(); } }; o.flat; o[k]();',
      ),
    ).toEqual([]);
    expect(names('import Atomics from "x"; Atomics.add(); class C { BigInt() {} }')).toEqual([]);
  });
});
