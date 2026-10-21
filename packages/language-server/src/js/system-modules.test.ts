/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadSystemModules } from '@ohjs/schemas';
import { checkEs5 } from './es5';
import { checkSystemModules } from './system-modules';
import { APP_LIFECYCLE, completeThis, PAGE_LIFECYCLE } from './this-completion';
import { extractViewModel } from './viewmodel';

describe('checkSystemModules (FR-LANG-007: importing a missing @system.* module is an error)', () => {
  const pack = loadSystemModules('5.0.3')!;
  const run = (code: string) => checkSystemModules(checkEs5(code).modules, pack);
  it('accepts modules compiled into the linux target, both prefixes and requireNative', () => {
    expect(
      run(
        "import router from '@system.router';\nimport hilog from '@ohos.hilog';\nvar p = requireNative('system.prompt');\nvar f = require('@system.file');\nimport x from './local';",
      ),
    ).toEqual([]);
  });
  it('unknown modules and modules compiled out by a feature switch', () => {
    const code =
      "import fetch from '@system.fetch';\nimport nope from '@system.nope';\nvar h = require('@ohos.security.huks');";
    const d = run(code);
    expect(d.map((x) => [x.rule, code.slice(x.range.start, x.range.end)])).toEqual([
      ['js/unknown-system-module', "'@system.fetch'"],
      ['js/unknown-system-module', "'@system.nope'"],
      ['js/unknown-system-module', "'@ohos.security.huks'"],
    ]);
    expect(d[0]!.message).toBe(
      'Module "@system.fetch" is not built into the linux target firmware (FEATURE_SUPPORT_HTTP is off); require() returns undefined',
    );
    expect(d[1]!.message).toBe(
      'Module "@system.nope" does not exist in OpenHarmony 5.0.3 (available on linux: app, audio, capability, cipher, device, deviceAttest, deviceInfo, dfx, file, hilog, prompt, router, storage)',
    );
    expect(d[2]!.message).toContain('FEATURE_ACELITE_HUKS is off');
  });
  it('conditional modules and feature-less disabled entries', () => {
    const p = {
      ...pack,
      modules: [
        { name: 'cam', availability: 'conditional' as const, feature: 'FEATURE_X', evidence: [] },
        { name: 'off', availability: 'disabled-by-feature' as const, evidence: [] },
      ],
    };
    const d = checkSystemModules(
      checkEs5("import a from '@system.cam'; import b from '@system.off';").modules,
      p,
    );
    expect(d.map((x) => x.message)).toEqual([
      'Module "@system.off" is not built into the linux target firmware; require() returns undefined',
    ]);
  });
});

describe('completeThis', () => {
  const page = `export default {
  data: { title: 'x', list: [] },
  onInit: function () { this. },
  tap: function () { this.ti },
  go: function () { var a = this
    .li; }
};`;
  const vm = extractViewModel(page);
  const at = (needle: string, delta: number) => page.indexOf(needle) + needle.length + delta;
  it('data, methods, lifecycle and framework members after `this.`', () => {
    const items = completeThis(page, at('this.', 0), vm, false);
    expect(items.map((i) => [i.label, i.kind, i.detail])).toEqual([
      ['title', 'variable', 'data'],
      ['list', 'variable', 'data'],
      ['tap', 'method', 'method'],
      ['go', 'method', 'method'],
      ['onInit', 'method', 'lifecycle'],
      ...PAGE_LIFECYCLE.filter((h) => h !== 'onInit').map((h) => [h, 'method', 'lifecycle']),
      ['$refs', 'property', 'Record<string, element>'],
      ['$app', 'property', 'app.js ViewModel'],
      ['$t', 'function', '$t(path: string, params?: object): string'],
      ['$watch', 'function', '$watch(getter, callback): Observer'],
    ]);
    expect(items[0]!.replace).toEqual({ start: at('this.', 0), end: at('this.', 0) });
    expect(items.find((i) => i.label === '$t')!.documentation).toContain('i18n');
  });
  it('replaces the typed prefix; works across a line break; app.js hooks', () => {
    const p = at('this.ti', 0);
    expect(completeThis(page, p, vm, false)[0]!.replace).toEqual({ start: p - 2, end: p });
    expect(completeThis(page, at('.li', 0), vm, false).length).toBeGreaterThan(0);
    const app = completeThis(
      'export default { onCreate: function () { this. } }',
      46,
      extractViewModel('export default { onCreate: function () {} }'),
      true,
    );
    expect(app.filter((i) => i.detail === 'lifecycle').map((i) => i.label)).toEqual([...APP_LIFECYCLE]);
    const withProps = completeThis(
      'this.',
      5,
      { data: [], props: ['p'], computed: ['c'], methods: [], lifecycle: [] },
      false,
    );
    expect(withProps.slice(0, 2).map((i) => [i.label, i.detail])).toEqual([
      ['p', 'props'],
      ['c', 'computed'],
    ]);
  });
  it('nothing outside `this.`', () => {
    expect(completeThis(page, at('var a', 0), vm, false)).toEqual([]);
    expect(completeThis('that.', 5, vm, false)).toEqual([]);
  });
});
