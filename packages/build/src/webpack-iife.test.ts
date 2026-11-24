/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { repairNegatedWebpackIife } from './webpack-iife';

const negated =
  '!function(){var e={1:function(e,t,n){e.exports=new ViewModel(n(2))},2:function(e,t){t.default={onCreate:function(){}}}},t={};(function n(o){return e[o](t[o]={exports:{}},t[o].exports,n),t[o].exports})(1)}();\n' +
  '//# sourceMappingURL=_releaseMap/app.js.map';

function evalBundle(source: string): unknown {
  return vm.runInNewContext(source, {
    ViewModel: function ViewModel(this: { opts: unknown }, opts: unknown) {
      this.opts = opts;
    },
  });
}

describe('repairNegatedWebpackIife', () => {
  it('makes a terser-negated webpack bundle evaluate to the ViewModel', () => {
    expect(typeof evalBundle(negated)).toBe('boolean');
    const repaired = repairNegatedWebpackIife(negated);
    expect(repaired.startsWith('(function(){')).toBe(true);
    expect(repaired).toContain('return (function n(o)');
    expect(repaired.endsWith('//# sourceMappingURL=_releaseMap/app.js.map')).toBe(true);
    const result = evalBundle(repaired) as { opts: { default: { onCreate: unknown } } };
    expect(typeof result.opts.default.onCreate).toBe('function');
  });

  it('leaves a DevEco bundle that already returns the ViewModel unchanged', () => {
    const deveco = '(function(){var o=new ViewModel({});return o})();';
    expect(repairNegatedWebpackIife(deveco)).toBe(deveco);
    expect(evalBundle(deveco)).toMatchObject({ opts: {} });
  });
});
