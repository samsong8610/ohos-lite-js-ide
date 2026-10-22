/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { JsCapabilitiesFile } from '@ohjs/schemas';
import { buildOutputs } from './run';
import { writeMiniSources } from '../test/mini-sources';
import {
  evalCondition,
  generateJsCapabilities,
  JERRY_PATHS,
  OWNER_FILES,
  macroTable,
  parseBuildDefines,
  parseBuiltinTable,
  parseConfigDefaults,
  parseGni,
  parseMagicStrings,
  probeApis,
  renderJsCapabilitiesDiff,
} from './js-capabilities';

const GNI = [
  'declare_args() {',
  '  jerryscript_jerry_es2015 = 1  # on',
  '  jerryscript_jerry_es2015_builtin_weakmap = 0',
  '  jerryscript_flag = true',
  '  jerryscript_off = false',
  '  jerryscript_name = "x"',
  '}',
].join('\n');
const BUILD = [
  'if (board_toolchain_type == "iccarm") {',
  '  jerry_core_defines = [',
  '    "JERRY_ES2015=${jerryscript_jerry_es2015}",',
  '    "JERRY_ES2015_BUILTIN_WEAKMAP=${jerryscript_jerry_es2015_builtin_weakmap}",',
  '    "JERRY_ES2015=9",',
  '    "JERRY_GLOBAL_HEAP_SIZE=(128)",',
  '    "JERRY_LINE_INFO",',
  '    "JERRY_FLAG=${jerryscript_flag}",',
  '    "JERRY_OFF=${jerryscript_off}",',
  '    "JERRY_NAME=${jerryscript_name}",',
  '    "JERRY_MISSING=${nope}",',
  '    "JERRY_ALIAS=JERRY_ES2015",',
  '    "JERRY_ODD=a+b",',
  '  ]',
  '} else {',
  '  jerry_core_defines = [ "JERRY_IGNORED=1" ]',
  '}',
].join('\n');
const CONFIG = [
  '#if defined(_WIN32)',
  '# define JERRY_BUILTIN_REGEXP 1',
  '#endif',
  '#if (!defined(_WIN32))',
  '#ifndef JERRY_BUILTIN_REGEXP',
  '# define JERRY_BUILTIN_REGEXP 0 // off on devices',
  '#endif',
  '# define JERRY_BUILTIN_EVAL_DISABLED 1',
  '#endif',
  '#ifndef JERRY_BUILTIN_REGEXP',
  '# define JERRY_BUILTIN_REGEXP 1',
  '#endif',
  '# define JERRY_BUILTIN_MATH 1 /* yes */',
  '# define JERRY_SELF JERRY_SELF',
  '# define JERRY_BARE',
].join('\n');

describe('build macro parsing', () => {
  it('reads engine.gni, the first jerry_core_defines block and the config.h sections', () => {
    const g = parseGni(GNI);
    expect(g.get('jerryscript_jerry_es2015')).toEqual({ value: '1', line: 2 });
    expect(g.get('jerryscript_name')!.value).toBe('x');
    const d = parseBuildDefines(BUILD);
    expect(d.get('JERRY_ES2015')).toEqual({ raw: '${jerryscript_jerry_es2015}', line: 3 });
    expect(d.get('JERRY_LINE_INFO')!.raw).toBe('1');
    expect(d.has('JERRY_IGNORED')).toBe(false);
    const c = parseConfigDefaults(CONFIG);
    expect(c.gn.get('JERRY_BUILTIN_REGEXP')).toEqual({ raw: '0', line: 6 });
    expect(c.general.get('JERRY_BUILTIN_REGEXP')).toEqual({ raw: '1', line: 11 });
    expect(c.general.get('JERRY_BUILTIN_MATH')!.raw).toBe('1');
    expect(c.general.get('JERRY_BARE')!.raw).toBe('1');
  });
  it('resolves values with their source chain', () => {
    const m = macroTable(GNI, BUILD, CONFIG);
    expect(m.get('JERRY_ES2015')).toEqual({
      value: 1,
      source: 'jerry-core/BUILD.gn:3 ← engine.gni:2 jerryscript_jerry_es2015',
    });
    expect(m.value('JERRY_ES2015_BUILTIN_WEAKMAP')).toBe(0);
    expect(m.value('JERRY_GLOBAL_HEAP_SIZE')).toBe(128);
    expect(m.get('JERRY_GLOBAL_HEAP_SIZE')!.source).toBe('jerry-core/BUILD.gn:6');
    expect([
      m.value('JERRY_FLAG'),
      m.value('JERRY_OFF'),
      m.value('JERRY_NAME'),
      m.value('JERRY_MISSING'),
    ]).toEqual([1, 0, 0, 0]);
    expect(m.get('JERRY_MISSING')!.source).toContain('nope (unset)');
    expect(m.get('JERRY_ALIAS')).toEqual({ value: 1, source: 'jerry-core/BUILD.gn:12 ← JERRY_ES2015' });
    expect(m.value('JERRY_ODD')).toBe(1);
    expect(m.get('JERRY_BUILTIN_REGEXP')).toEqual({ value: 0, source: 'jerry-core/config.h:6' });
    expect(m.value('JERRY_BUILTIN_MATH')).toBe(1);
    expect(m.value('JERRY_SELF')).toBe(0);
    expect(m.get('JERRY_UNKNOWN')).toBeUndefined();
    expect(m.value('JERRY_UNKNOWN')).toBe(0);
    expect([...m.used.keys()]).not.toContain('JERRY_UNKNOWN');
    expect(m.used.has('JERRY_OFF')).toBe(true);
  });
  it('evaluates preprocessor conditions', () => {
    const m = macroTable(GNI, BUILD, CONFIG);
    expect(evalCondition('ENABLED (JERRY_ES2015)', m)).toBe(true);
    expect(evalCondition('JERRY_ES2015_BUILTIN_WEAKMAP', m)).toBe(false);
    expect(evalCondition('defined(JERRY_LINE_INFO) && !defined(JERRY_NOPE)', m)).toBe(true);
    expect(evalCondition('JERRY_GLOBAL_HEAP_SIZE >= 64', m)).toBe(true);
    expect(evalCondition('FOO_BAR', m)).toBeUndefined();
    expect(evalCondition('(1', m)).toBeUndefined();
  });
});

describe('builtin tables and probing', () => {
  const MAGIC = [
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_MAP_UL, "Map")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_WEAKMAP_UL, "WeakMap")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_EVAL, "eval")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_PROMISE_UL, "Promise")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_THEN, "then")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_ASSIGN, "assign")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_INCLUDES, "includes")',
    'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_INCLUDES_ALT, "includes")',
  ].join('\n');
  const FILES: Record<string, string> = {
    [JERRY_PATHS.magic]: MAGIC,
    [`${JERRY_PATHS.builtins}/ecma-builtin-global.inc.h`]: [
      '/* comment */',
      '#if ENABLED (JERRY_ES2015)',
      'OBJECT_VALUE (LIT_MAGIC_STRING_MAP_UL, x, y)',
      '#endif',
      '#if ENABLED (JERRY_ES2015_BUILTIN_WEAKMAP)',
      'OBJECT_VALUE (LIT_MAGIC_STRING_WEAKMAP_UL, x, y)',
      '#endif',
      '#if !defined(JERRY_X)',
      'ROUTINE (LIT_MAGIC_STRING_EVAL, f, 1, 1)',
      '#endif',
      '#if ENABLED (JERRY_ES2015_BUILTIN_WEAKMAP)',
      'OBJECT_VALUE (LIT_MAGIC_STRING_PROMISE_UL, x, y)',
      '#endif',
    ].join('\n'),
    [`${JERRY_PATHS.builtins}/ecma-builtin-promise-prototype.inc.h`]:
      'ROUTINE (LIT_MAGIC_STRING_THEN, f, 2, 2)',
    [`${JERRY_PATHS.builtins}/ecma-builtin-object.inc.h`]: 'ROUTINE (LIT_MAGIC_STRING_ASSIGN, f, 2, 2)',
    [`${JERRY_PATHS.builtins}/ecma-builtin-string-prototype.inc.h`]:
      'ROUTINE (LIT_MAGIC_STRING_INCLUDES_ALT, f, 2, 1)',
    [`${JERRY_PATHS.builtins}/ecma-builtin-symbol.inc.h`]:
      'SYMBOL_VALUE (LIT_GLOBAL_SYMBOL_ASYNC_ITERATOR, x)',
  };
  const read = (rel: string): string => FILES[rel] ?? '';
  it('parses magic strings and table entries with their guards', () => {
    expect(parseMagicStrings(MAGIC).get('includes')).toEqual([
      'LIT_MAGIC_STRING_INCLUDES',
      'LIT_MAGIC_STRING_INCLUDES_ALT',
    ]);
    const t = parseBuiltinTable(FILES[`${JERRY_PATHS.builtins}/ecma-builtin-global.inc.h`]!);
    expect(t[0]).toEqual({ id: 'LIT_MAGIC_STRING_MAP_UL', line: 3, conds: ['ENABLED (JERRY_ES2015)'] });
    expect(t[2]!.conds).toEqual([]);
  });
  it('probes availability, guards, owners and disabling macros', () => {
    const m = macroTable(GNI, BUILD, CONFIG);
    const r = probeApis(m, read, [
      ['Map', 'ES2015'],
      ['WeakMap', 'ES2015'],
      ['eval', 'ES1'],
      ['Promise.prototype.then', 'ES2015'],
      ['Object.assign', 'ES2015'],
      ['String.prototype.includes', 'ES2015'],
      ['Array.prototype.includes', 'ES2016'],
      ['Symbol.asyncIterator', 'ES2018'],
      ['Nope.x', 'ES2099'],
    ]);
    const by = Object.fromEntries(r.map((x) => [x.name, x]));
    expect(by['Map']).toEqual({
      name: 'Map',
      since: 'ES2015',
      available: true,
      source: 'jerry-core/ecma/builtin-objects/ecma-builtin-global.inc.h:3',
      guard: 'ENABLED (JERRY_ES2015)',
    });
    expect(by['WeakMap']!.available).toBe(false);
    expect(by['WeakMap']!.reason).toBe(
      'compiled out of the device engine: JERRY_ES2015_BUILTIN_WEAKMAP = 0 (jerry-core/BUILD.gn:4 ← engine.gni:3 jerryscript_jerry_es2015_builtin_weakmap)',
    );
    expect(by['eval']!.reason).toBe(
      'disabled in the device engine: JERRY_BUILTIN_EVAL_DISABLED = 1 (jerry-core/config.h:8); the call returns undefined',
    );
    expect(by['Promise.prototype.then']!.available).toBe(false);
    expect(by['Promise.prototype.then']!.source).toMatch(
      /promise-prototype\.inc\.h:1; owner .*global\.inc\.h:12$/,
    );
    expect(by['Object.assign']!.available).toBe(true);
    expect(by['String.prototype.includes']!.available).toBe(true);
    expect(by['Array.prototype.includes']).toMatchObject({
      available: false,
      reason: 'not implemented by the device JerryScript engine',
    });
    expect(by['Symbol.asyncIterator']).toMatchObject({
      available: false,
      source: expect.stringContaining('symbol.inc.h:1; owner'),
    });
    expect(by['Nope.x']!.source).toBe('jerry-core/ecma/builtin-objects/undefined: no entry');
  });
  it('generates a file from a checkout and diffs two versions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jerry-'));
    const files: Record<string, string> = {
      ...Object.fromEntries(Object.values(OWNER_FILES).map((f) => [`${JERRY_PATHS.builtins}/${f}`, ''])),
      ...FILES,
      [JERRY_PATHS.gni]: GNI,
      [JERRY_PATHS.build]: BUILD,
      [JERRY_PATHS.config]: CONFIG,
      [JERRY_PATHS.api]: '#define JERRY_API_MAJOR_VERSION 2\n#define JERRY_API_MINOR_VERSION 3',
    };
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    // every probe file must exist for the full probe list
    const a = generateJsCapabilities(root, {
      ohVersion: '5.0.3',
      generator: 'test',
      commit: 'abc',
      tags: ['t'],
    });
    fs.writeFileSync(path.join(root, JERRY_PATHS.api), '');
    const b = generateJsCapabilities(root, { ohVersion: '6.1', generator: 'test', tags: [] });
    expect(a.engine).toEqual({ name: 'jerryscript', apiVersion: '2.3', commit: 'abc', tags: ['t'] });
    expect(b.engine.apiVersion).toBe('?.?');
    expect(Object.keys(a.macros)).toEqual([...Object.keys(a.macros)].sort());
    expect(a.macros['JERRY_BUILTIN_REGEXP']!.value).toBe(0);
    expect(a.apis.find((x) => x.name === 'Map')!.available).toBe(true);
    expect(renderJsCapabilitiesDiff(a, b)).toBe(
      '# JS capabilities: 5.0.3 → 6.1\n\nJerryScript API 2.3 → ?.?\n\n## Built-in APIs\n\nNo availability changes.\n\n## Build macros\n\nNo macro value changes.\n',
    );
    const c: JsCapabilitiesFile = {
      ...b,
      macros: { ...b.macros, JERRY_ES2015: { value: 0, source: 'x' }, JERRY_NEW: { value: 1, source: 'y' } },
      apis: [
        ...b.apis.filter((x) => x.name !== 'Map' && x.name !== 'Set'),
        { ...b.apis.find((x) => x.name === 'Map')!, available: false },
        { name: 'Foo', since: 'ES2099', available: true, source: 'z' },
        { name: 'Bar', since: 'ES2099', available: false, source: 'z' },
      ],
    };
    const { JERRY_ES2015_BUILTIN_WEAKMAP: _drop, ...rest } = c.macros;
    const d = renderJsCapabilitiesDiff(a, { ...c, macros: rest });
    expect(d).toContain('- Map: available → unavailable');
    expect(d).toContain('- Foo: added to the probe list (available)');
    expect(d).toContain('- Bar: added to the probe list (unavailable)');
    expect(d).toContain('- Set: removed from the probe list');
    expect(d).toContain('- JERRY_ES2015: 1 → 0');
    expect(d).toContain('- JERRY_NEW: — → 1');
    expect(d).toContain('- JERRY_ES2015_BUILTIN_WEAKMAP: 0 → —');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('js-capabilities in the extractor pipeline', () => {
  it('writes <ver>/js-capabilities.json and diff-js only when both sides have a jerryscript checkout', () => {
    const roots = ['a', 'b'].map((v) => writeMiniSources(v as 'a' | 'b'));
    const jerry = fs.mkdtempSync(path.join(os.tmpdir(), 'jerry-'));
    const files: Record<string, string> = {
      ...Object.fromEntries(Object.values(OWNER_FILES).map((f) => [`${JERRY_PATHS.builtins}/${f}`, ''])),
      [JERRY_PATHS.magic]: 'LIT_MAGIC_STRING_DEF (LIT_MAGIC_STRING_MAP_UL, "Map")',
      [`${JERRY_PATHS.builtins}/ecma-builtin-global.inc.h`]: 'OBJECT_VALUE (LIT_MAGIC_STRING_MAP_UL, x, y)',
      [JERRY_PATHS.gni]: GNI,
      [JERRY_PATHS.build]: BUILD,
      [JERRY_PATHS.config]: CONFIG,
      [JERRY_PATHS.api]: '#define JERRY_API_MAJOR_VERSION 2\n#define JERRY_API_MINOR_VERSION 3',
    };
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(jerry, rel)), { recursive: true });
      fs.writeFileSync(path.join(jerry, rel), text);
    }
    const set = (v: string, i: number, j?: string) => ({
      ohVersion: v,
      provisional: false,
      target: 'linux',
      engine: roots[i]!.engine,
      loader: roots[i]!.loader,
      docs: roots[i]!.docs,
      ...(j ? { jerryscript: j } : {}),
    });
    const logs: string[] = [];
    const { outputs } = buildOutputs(
      {
        versions: [set('5.0.3', 0, jerry), set('6.1-LTS', 1, jerry)],
        diff: [{ from: '5.0.3', to: '6.1-LTS' }],
      },
      (m) => logs.push(m),
    );
    const c = JSON.parse(outputs.get('v5.0.3/js-capabilities.json')!) as JsCapabilitiesFile;
    expect(c.engine.apiVersion).toBe('2.3');
    expect(c.apis.find((x) => x.name === 'Map')!.available).toBe(true);
    expect(outputs.get('diff-js-5.0.3-6.1-lts.md')).toContain('No availability changes.');
    expect(logs.some((l) => /probed JS APIs unavailable/.test(l))).toBe(true);
    const one = buildOutputs({
      versions: [set('5.0.3', 0, jerry), set('6.1-LTS', 1)],
      diff: [{ from: '5.0.3', to: '6.1-LTS' }],
    }).outputs;
    expect([...one.keys()].filter((k) => k.includes('js-'))).toEqual(['v5.0.3/js-capabilities.json']);
    for (const d of [jerry, ...roots.map((r) => r.root)]) fs.rmSync(d, { recursive: true, force: true });
  });
});
