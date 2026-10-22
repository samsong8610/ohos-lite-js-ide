/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadJsCapabilities, type JsCapabilitiesFile } from '@ohjs/schemas';
import { checkEs5 } from './es5';
import { capabilityLists, findUnsupportedBuiltins } from './builtins';

const caps = loadJsCapabilities('5.0.3')!;
const names = (code: string, c: JsCapabilitiesFile = caps): string[] => {
  const r = checkEs5(code);
  return findUnsupportedBuiltins(r.ast!, c).map((f) => `${f.entry.name}@${code.slice(f.start, f.end)}`);
};

describe('built-in APIs from js-capabilities.json (device JerryScript build)', () => {
  it('both packs exist and agree with the engine source facts', () => {
    for (const v of ['5.0.3', '6.1-lts']) {
      const { available, unavailable } = capabilityLists(loadJsCapabilities(v)!);
      expect(available).toEqual(
        expect.arrayContaining([
          'Symbol',
          'Promise',
          'Map',
          'Set',
          'Object.assign',
          'String.prototype.includes',
          'Array.prototype.entries',
          'Array.prototype.values',
        ]),
      );
      expect(unavailable).toEqual(
        expect.arrayContaining([
          'WeakMap',
          'WeakSet',
          'DataView',
          'Reflect',
          'RegExp',
          'eval',
          'Array.prototype.includes',
          'Object.entries',
          'Object.values',
        ]),
      );
    }
  });
  it('reports globals, statics and prototype methods with the table source', () => {
    expect(
      names(
        'var m = new WeakMap(); Reflect.ownKeys(o); globalThis.x; Object.entries(o); Promise.allSettled(p);' +
          ' s.padStart(2); a.flat(); p.finally(f); [1].includes(1); Symbol.asyncIterator; new DataView(b); "a".replace("a", "b");',
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
      'DataView@DataView',
      'String.prototype.replace@replace',
    ]);
    const r = checkEs5('new WeakMap();');
    expect(findUnsupportedBuiltins(r.ast!, caps)[0]!.entry.reason).toMatch(
      /JERRY_ES2015_BUILTIN_WEAKMAP = 0 .*engine\.gni.*\[jerry-core\/ecma\/builtin-objects\/ecma-builtin-global\.inc\.h:\d+\]/,
    );
    expect(names("var list = [1, 2]; list.includes(1); list['flatMap'](f); `x`.includes('x');")).toEqual([
      'Array.prototype.includes@includes',
      "Array.prototype.flatMap@'flatMap']",
    ]);
  });
  it('does not report what the engine has, shadowed names, keys or ViewModel methods', () => {
    expect(
      names(
        'Object.assign({}, a); new Promise(f); new Map(); new Set(); Symbol("x"); Array.from(a); Array.of(1);' +
          ' "ab".includes("a"); s.includes("a"); s.startsWith("a"); s.endsWith("a"); s.repeat(2); Number.isInteger(1);' +
          ' [1].entries(); m.values(); s.split(",");',
      ),
    ).toEqual([]);
    expect(
      names(
        'var Reflect = {}; Reflect.x; function f(WeakMap) { return WeakMap; } var o = { WeakMap: 1, flat: 2 }; o.WeakMap;' +
          ' export default { padStart() {}, go() { this.padStart(); } }; o.flat; o[k]();',
      ),
    ).toEqual([]);
    expect(names('import Atomics from "x"; Atomics.add(); class C { BigInt() {} }')).toEqual([]);
    // ES5-era names need an evident String receiver (router.replace is an app API)
    expect(names("router.replace({ uri: 'a' }); s.match(x); 'a'.search('a');")).toEqual([
      'String.prototype.search@search',
    ]);
  });
  it('an ambiguous method missing on several owners needs an evident receiver', () => {
    const two: JsCapabilitiesFile = {
      ...caps,
      apis: [
        { name: 'Array.prototype.at', since: 'ES2022', available: false, source: 'a', reason: 'r' },
        { name: 'String.prototype.at', since: 'ES2022', available: false, source: 's', reason: 'r' },
      ],
    };
    expect(names('x.at(0); [1].at(0); "a".at(0);', two)).toEqual([
      'Array.prototype.at@at',
      'String.prototype.at@at',
    ]);
    const noReason: JsCapabilitiesFile = {
      ...caps,
      apis: [{ name: 'Foo', since: 'ES2015', available: false, source: 'x' } as never],
    };
    expect(findUnsupportedBuiltins(checkEs5('Foo;').ast!, noReason)[0]!.entry.reason).toBe(
      'not available [x]',
    );
  });
});
