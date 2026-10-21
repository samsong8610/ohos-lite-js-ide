/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { extractLiteEnum, imageExtensions } from './ace-loader';
import { scanComponentImpl } from './component-impl';
import { baseClassOf, classToFileStem, parseComponentFactory } from './factory';
import { featureSwitches, parseAceliteConfig, stringSettings } from './feature-macros';
import { readGitInfo } from './git-info';
import { keysByEnum, parseKeysH } from './keys-h';

describe('parseKeysH', () => {
  it('reads KEYWORD entries with lines and feature guards', () => {
    const e = parseKeysH(
      '// KEYWORD(NOT, comment)\nKEYWORD(DIV, div) // c\n#if (FEATURE_X == 1)\n  KEYWORD(ANALOG_CLOCK, analog-clock)\n#endif\n',
    );
    expect(e).toEqual([
      { enumName: 'DIV', key: 'div', line: 2 },
      { enumName: 'ANALOG_CLOCK', key: 'analog-clock', line: 4, feature: 'FEATURE_X' },
    ]);
    expect(keysByEnum(e).get('K_DIV')!.key).toBe('div');
  });
});

describe('acelite_config.h', () => {
  const cfg = [
    '#ifndef ACELITE_CONFIG_H',
    '#define ACELITE_CONFIG_H',
    '#ifdef FEATURE_A',
    '#error "dup"',
    '#else',
    '#define FEATURE_A',
    '#endif',
    '#ifndef FEATURE_B',
    '#define FEATURE_B 1',
    '#endif',
    '#define FEATURE_C 0',
    '#if defined(EXT)',
    '#define FEATURE_D',
    '#endif',
    '#define ENABLE_E',
    '#define PATH_X "/user/x"',
    '#define NUM 3',
    '#endif',
  ].join('\n');
  it('parses features incl. guard idioms and conditionals', () => {
    const f = featureSwitches(parseAceliteConfig(cfg));
    expect(f['FEATURE_A']).toEqual({ value: true, line: 6 });
    expect(f['FEATURE_B']).toEqual({ value: true, line: 9 });
    expect(f['FEATURE_C']!.value).toBe(false);
    expect(f['FEATURE_D']).toEqual({ value: 'conditional', line: 13, dependsOn: ['defined(EXT)'] });
    expect(f['ENABLE_E']!.value).toBe(true);
    expect(f['ACELITE_CONFIG_H']).toBeUndefined();
    expect(stringSettings(parseAceliteConfig(cfg))).toEqual({ PATH_X: { value: '/user/x', line: 16 } });
  });
});

describe('parseComponentFactory', () => {
  it('parses an out-of-line CreateComponent with fallthrough and feature guards', () => {
    const text = `Component* ComponentFactory::CreateComponent(uint16_t id)
{
    Component* component = nullptr;
    switch (id) {
        case K_A:
        case K_B:
            component = new BComponent();
            break;
#ifdef FEATURE_V
        case K_V:
            component = new VComponent();
            break;
#endif
        case K_P: {
#if (FEATURE_Q == 1)
            if (type == K_Q) { component = new QComponent(); break; }
#endif
            component = new PComponent();
            break;
        }
        case K_NONE:
            component = nullptr;
            break;
    }
    return component;
}`;
    const r = parseComponentFactory(text);
    expect(r.map((x) => x.tagEnum)).toEqual(['K_A', 'K_B', 'K_V', 'K_P']);
    expect(r[0]!.variants[0]!.implClass).toBe('BComponent');
    expect(r[2]!.feature).toBe('FEATURE_V');
    expect(r[3]!.variants).toEqual([
      { implClass: 'QComponent', typeKeys: ['K_Q'], line: 16, feature: 'FEATURE_Q' },
      { implClass: 'PComponent', typeKeys: [], line: 18 },
    ]);
  });
  it('throws when CreateComponent is missing', () => {
    expect(() => parseComponentFactory('class X {};')).toThrow(/CreateComponent not found/);
  });
  it('helpers', () => {
    expect(baseClassOf('class A final : public B {', 'A')).toBe('B');
    expect(baseClassOf('class A {', 'A')).toBeUndefined();
    expect(classToFileStem('InputCheckboxComponent')).toBe('input_checkbox_component');
  });
});

describe('scanComponentImpl', () => {
  it('collects private attributes/styles/events/methods with evidence and features', () => {
    const text = `static constexpr char FN_X[] = "x";
const MethodMap C::methodMap_[] = { {"m0", A}, {C::FN_X, B}, {UNRESOLVED, D} };
bool C::SetPrivateAttribute(uint16_t attrKeyId, jerry_value_t v)
{
    switch (attrKeyId) {
        case K_A: break;
#if (FEATURE_Z == 1)
        case K_Z: break;
#endif
        case K_A: break;
    }
    return true;
}
bool C::ApplyPrivateStyle(const AppStyleItem* style)
{
    return Helper(style);
}
bool C::Helper(const AppStyleItem* style)
{
    switch (stylePropNameId) { case K_S: break; }
    return true;
}
bool C::RegisterPrivateEventListener(uint16_t eventTypeId, jerry_value_t f, bool s)
{
    return eventTypeId == K_E;
}
void C::Init()
{
    RegisterNamedFunction(methodMap_[0].methodName, A);
    RegisterNamedFunction(methodMap_[1].methodName, B);
    RegisterNamedFunction(methodMap_[2].methodName, D);
    RegisterNamedFunction(GLOBAL, G);
}`;
    const r = scanComponentImpl('C', { rel: 'c.cpp', text }, new Map([['GLOBAL', 'g']]));
    expect(r.attributes.map((a) => [a.enumName, a.feature])).toEqual([
      ['K_A', undefined],
      ['K_Z', 'FEATURE_Z'],
    ]);
    expect(r.attributes[0]!.evidence).toEqual({ file: 'c.cpp', line: 6 });
    expect(r.styles.map((s) => s.enumName)).toEqual(['K_S']);
    expect(r.events.map((s) => s.enumName)).toEqual(['K_E']);
    expect(r.methods.map((m) => m.name)).toEqual(['m0', 'x', 'UNRESOLVED', 'g']);
    expect(r.warnings).toEqual([]);
  });
  it('without a methodMap index expressions resolve to nothing', () => {
    const r = scanComponentImpl(
      'C',
      { rel: 'c.cpp', text: 'void C::I() { RegisterNamedFunction(methodMap_[0].methodName, A); }' },
      new Map(),
    );
    expect(r.methods).toEqual([]);
    expect(r.warnings[0]).toMatch(/c\.cpp:1: cannot resolve method name/);
  });
});

describe('extractLiteEnum', () => {
  it('evaluates exports in a sandbox', () => {
    const r = extractLiteEnum(
      "exports.SPECIAL_STYLE = { A: 'a', N: 1 }; exports.DEVICE_TYPE = { L: 'lite' }; exports.REGEXP_PNG = /(\\.png|\\.JPG)$/; exports.X = null;",
    );
    expect(r.specialStyles).toEqual({ A: 'a' });
    expect(r.deviceTypes).toEqual({ L: 'lite' });
    expect(r.platforms).toEqual({});
    expect(imageExtensions(r)).toEqual(['jpg', 'png']);
  });
  it('supports module.exports replacement and the grouped regexp form', () => {
    const r = extractLiteEnum('module.exports = { REGEXP_PNG: /\\.(png|bmp)$/i };');
    expect(imageExtensions(r)).toEqual(['bmp', 'png']);
    expect(imageExtensions(extractLiteEnum(''))).toEqual([]);
  });
  it('cannot reach require or process', () => {
    expect(() => extractLiteEnum("require('fs')")).toThrow();
    expect(() => extractLiteEnum('process.exit(1)')).toThrow();
  });
  it('times out runaway code', () => {
    expect(() => extractLiteEnum('while (true) {}', 50)).toThrow(/timed out/);
  });
});

describe('readGitInfo', () => {
  const mk = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-git-'));
  it('returns no commit without a .git dir', () => {
    const d = mk();
    expect(readGitInfo(d)).toEqual({ tags: [] });
  });
  it('reads a detached HEAD, packed and loose tags', () => {
    const d = mk();
    const sha = '1'.repeat(40);
    fs.mkdirSync(path.join(d, '.git/refs/tags'), { recursive: true });
    fs.writeFileSync(path.join(d, '.git/HEAD'), `${sha}\n`);
    fs.writeFileSync(
      path.join(d, '.git/packed-refs'),
      `${sha} refs/tags/t1\n${'2'.repeat(40)} refs/tags/other\n`,
    );
    fs.writeFileSync(path.join(d, '.git/refs/tags/t2'), `${sha}\n`);
    expect(readGitInfo(d)).toEqual({ commit: sha, tags: ['t1', 't2'] });
  });
  it('resolves a branch from packed-refs', () => {
    const d = mk();
    const sha = '3'.repeat(40);
    fs.mkdirSync(path.join(d, '.git'));
    fs.writeFileSync(path.join(d, '.git/HEAD'), 'ref: refs/heads/dev\n');
    fs.writeFileSync(path.join(d, '.git/packed-refs'), `${sha} refs/heads/dev\n`);
    expect(readGitInfo(d).commit).toBe(sha);
  });
});
