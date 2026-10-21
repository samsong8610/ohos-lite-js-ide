/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadComponentsSchema } from '@ohjs/schemas';
import { fixtureSchema } from '../../test/fixture-schema';
import { validateHml } from './diagnostics';
import { parseHml } from './parser';
import { isRuleId, parseSuppressions, resolveSeverity, HML_RULES } from './rules';
import { SchemaView } from './schema-view';

const view = new SchemaView(fixtureSchema());
const run = (t: string, rules?: Record<string, unknown>) =>
  validateHml(parseHml(t), view, rules ? { rules } : {});
const rules = (t: string, r?: Record<string, unknown>) => run(t, r).map((d) => d.rule);

describe('HML rules: each with a positive and a negative case (FR-LANG-006)', () => {
  it('hml/syntax', () => {
    expect(rules('<div>')).toEqual(['hml/syntax']);
    expect(rules('<div></div>')).toEqual([]);
  });
  it('hml/unknown-component', () => {
    const d = run('<foo></foo><button></button>');
    expect(d.map((x) => x.rule)).toEqual(['hml/unknown-component', 'hml/unknown-component']);
    expect(d[0]!.message).toBe('Unknown component <foo> for OpenHarmony 9.9');
    expect(d[1]!.message).toContain('full JS UI framework');
    expect(d[0]!.range).toEqual({ start: 1, end: 4 });
    expect(d[0]!.severity).toBe('error');
    expect(rules('<free></free>')).toEqual([]);
  });
  it('hml/component-disabled-by-feature; conditional and undocumented components are allowed (Q9)', () => {
    const d = run('<tabs></tabs><tabs2></tabs2>');
    expect(d.map((x) => x.rule)).toEqual([
      'hml/component-disabled-by-feature',
      'hml/component-disabled-by-feature',
    ]);
    expect(d[0]!.message).toBe('<tabs> is compiled out for target linux (FEATURE_COMPONENT_TABS is off)');
    expect(d[1]!.message).toBe('<tabs2> is compiled out for target linux');
    // allowed (Q9), but flagged with an information-level hint
    const c = run('<video></video><camera></camera>');
    expect(c.map((x) => [x.rule, x.severity])).toEqual([
      ['hml/conditional-component', 'information'],
      ['hml/conditional-component', 'information'],
    ]);
    expect(c[0]!.message).toContain('an optional build flag');
    expect(c[1]!.message).toContain('not documented for OpenHarmony 9.9');
    expect(rules('<free></free>')).toEqual([]);
  });
  it('hml/invalid-child: allow-list, none, except', () => {
    expect(run('<list><text></text></list>')[0]!.message).toBe(
      '<text> is not allowed inside <list>: only <list-item> allowed',
    );
    expect(run('<text><div></div></text>')[0]!.message).toContain('does not accept child components');
    expect(run('<swiper><list></list></swiper>')[0]!.message).toContain('<list> is excluded');
    expect(
      rules('<list><list-item></list-item></list><swiper><div></div></swiper><div><foo></foo></div>'),
    ).toEqual(['hml/unknown-component']);
    expect(rules('<foo><text></text></foo>')).toEqual(['hml/unknown-component']);
  });
  it('hml/for-with-if', () => {
    expect(rules('<div for="{{a}}" if="{{b}}"></div>')).toEqual(['hml/for-with-if']);
    expect(rules('<div for="{{a}}"><div if="{{b}}"></div></div>')).toEqual([]);
  });
  it('hml/unknown-attribute and hml/doc-only-attribute', () => {
    expect(rules('<text foo="1"></text>')).toEqual(['hml/unknown-attribute']);
    expect(run('<text legacy="1"></text>')[0]).toMatchObject({
      rule: 'hml/doc-only-attribute',
      severity: 'warning',
    });
    expect(rules('<text value="1" id="a" class="c" show for="{{x}}" else></text>')).toEqual([]);
    // attributes are not checked on unknown components (one error is enough)
    expect(rules('<foo bar="1"></foo>')).toEqual(['hml/unknown-component']);
  });
  it('hml/attribute-disabled-by-feature for attributes and events', () => {
    const d = run('<input secret="1" ongone="h" cam="1" hidden="1"></input>');
    expect(d.map((x) => [x.rule, x.message])).toEqual([
      [
        'hml/attribute-disabled-by-feature',
        'Attribute "secret" of <input> is compiled out (FEATURE_SECRET is off)',
      ],
      ['hml/attribute-disabled-by-feature', 'Event "gone" of <input> is compiled out (FEATURE_GONE is off)'],
    ]);
  });
  it('hml/unknown-event, hml/doc-only-event, event prefixes and case-insensitive keys', () => {
    expect(rules('<list onscrollend="a" @click="b" on:touchstart="c" grab:click.bubble="d"></list>')).toEqual(
      [],
    );
    expect(rules('<text onfoo="a"></text>')).toEqual(['hml/unknown-event']);
    expect(rules('<text onoldevent="a"></text>')).toEqual(['hml/doc-only-event']);
    expect(rules('<input onchange="a"></input>')).toEqual([]);
    expect(rules('<text onchange="a"></text>')).toEqual(['hml/unknown-event']);
  });
  it('hml/unknown-event-modifier', () => {
    expect(rules('<div on:click.capture="a"></div>')).toEqual(['hml/unknown-event-modifier']);
    expect(rules('<div on:click.bubble="a"></div>')).toEqual([]);
  });
  it('hml/empty-event-handler', () => {
    expect(rules('<div onclick=""></div><div @click></div>')).toEqual([
      'hml/empty-event-handler',
      'hml/empty-event-handler',
    ]);
    expect(rules('<div onclick="go"></div>')).toEqual([]);
  });
});

describe('rule switches and suppression comments', () => {
  it('settings change severity or turn rules off; junk is ignored', () => {
    expect(run('<foo></foo>', { 'hml/unknown-component': 'warning' })[0]!.severity).toBe('warning');
    expect(rules('<foo></foo>', { 'hml/unknown-component': 'off' })).toEqual([]);
    expect(run('<foo></foo>', { 'hml/unknown-component': 'loud' })[0]!.severity).toBe('error');
    expect(resolveSeverity('hml/for-with-if', undefined)).toBe('warning');
    expect(isRuleId('hml/syntax')).toBe(true);
    expect(isRuleId('toString')).toBe(false);
    expect(Object.keys(HML_RULES)).toHaveLength(26);
  });
  it('file-level and next-line comments', () => {
    expect(rules('<!-- ohjs-disable hml/unknown-component -->\n<foo></foo>')).toEqual([]);
    expect(rules('<!-- ohjs-disable -->\n<foo x></foo><div>')).toEqual([]);
    expect(rules('<!-- ohjs-disable-next-line hml/unknown-component -->\n<foo></foo>\n<bar></bar>')).toEqual([
      'hml/unknown-component',
    ]);
    expect(rules('<!-- ohjs-disable-next-line -->\n<foo></foo>')).toEqual([]);
    expect(rules('<!-- ohjs-disable-next-line hml/unknown-attribute -->\n<foo></foo>')).toEqual([
      'hml/unknown-component',
    ]);
    expect(rules('<!-- just a comment -->\n<foo></foo>')).toEqual(['hml/unknown-component']);
    const s = parseSuppressions([{ text: ' ohjs-disable-next-line a, b ', endLine: 3 }]);
    expect([...s.lines.get(4)!]).toEqual(['a', 'b']);
  });
});

describe('against the real generated data packs', () => {
  for (const version of ['5.0.3', '6.1-LTS']) {
    it(`OpenHarmony ${version}`, () => {
      const v = new SchemaView(loadComponentsSchema(version));
      const ok = `<div class="page" onclick="tap">
  <list class="l" onscrollend="end">
    <list-item for="{{items}}" tid="id"><text value="{{$item.name}}"></text></list-item>
  </list>
  <swiper index="0" onchange="swiped"><image src="/common/a.png"></image></swiper>
  <input type="checkbox" checked="true" onchange="toggle"></input>
  <slider min="0" max="100" value="5"></slider>
  <progress type="horizontal" percent="10"></progress>
  <chart datasets="{{d}}" options="{{o}}"></chart>
  <video src="a.mp4"></video>
  <stack><text>hello</text></stack>
</div>`;
      const okDiags = validateHml(parseHml(ok), v);
      expect(okDiags.map((d) => d.rule)).toEqual(['hml/conditional-component']);
      expect(okDiags[0]!.message).toContain('FEATURE_COMPONENT_VIDEO');
      const bad = '<div><button></button><tabs></tabs><list><text></text></list><text foo="1"></text></div>';
      expect(validateHml(parseHml(bad), v).map((d) => d.rule)).toEqual([
        'hml/unknown-component',
        'hml/component-disabled-by-feature',
        'hml/invalid-child',
        'hml/unknown-attribute',
      ]);
    });
  }
});

describe('ES6 in expressions and cross-file project rules', () => {
  const v = new SchemaView(loadComponentsSchema('5.0.3'));
  const run = (text: string, opts: Parameters<typeof validateHml>[2] = {}) =>
    validateHml(parseHml(text), v, opts);
  it('hml/es6-in-expression (error) with the construct range; switchable', () => {
    const t =
      '<div><text>{{ items.map(x => x.n) }}</text><text value="{{`a`}}"></text><text>{{ a + 1 }}</text></div>';
    const d = run(t).filter((x) => x.rule === 'hml/es6-in-expression');
    expect(d.map((x) => [x.severity, t.slice(x.range.start, x.range.end)])).toEqual([
      ['error', 'x => x.n'],
      ['error', '`a`'],
    ]);
    expect(d[0]!.message).toBe(
      'Arrow functions (ES2015+) cannot be used in expressions: the engine runs ES5.1',
    );
    expect(
      run(t, { rules: { 'hml/es6-in-expression': 'off' } }).filter((x) => x.rule === 'hml/es6-in-expression'),
    ).toEqual([]);
  });
  it('prj/page-not-registered', () => {
    const t = '<div></div>';
    expect(
      run(t, { project: { page: 'pages/a/a', registeredPages: ['pages/index/index'] } }).map((x) => [
        x.rule,
        x.severity,
        x.range,
      ]),
    ).toEqual([['prj/page-not-registered', 'warning', { start: 1, end: 4 }]]);
    expect(run('', { project: { page: 'pages/a/a', registeredPages: [] } })[0]!.range).toEqual({
      start: 0,
      end: 0,
    });
    expect(run(t, { project: { page: 'pages/a/a', registeredPages: ['pages/a/a'] } })).toEqual([]);
    expect(run(t, { project: { page: 'pages/a/a' } })).toEqual([]);
    expect(run(t, { project: { registeredPages: [] } })).toEqual([]);
  });
  it('i18n/missing-key and i18n/missing-translation', () => {
    const t = `<div><text>{{ $t('s.hello') }}</text><text>{{ $t('s.bye') }}</text><text>{{ $t('s.only') }}</text></div>`;
    const i18n = new Map([
      ['en-US.json', new Set(['s.hello', 's.only'])],
      ['zh-CN.json', new Set(['s.hello'])],
    ]);
    const d = run(t, { project: { i18n } });
    expect(d.map((x) => [x.rule, x.severity, x.message])).toEqual([
      ['i18n/missing-key', 'error', "$t('s.bye'): key not defined in i18n/en-US.json, i18n/zh-CN.json"],
      ['i18n/missing-translation', 'warning', "$t('s.only'): missing in i18n/zh-CN.json"],
    ]);
    expect(t.slice(d[0]!.range.start, d[0]!.range.end)).toBe('s.bye');
    expect(run(t, { project: { i18n: new Map() } }).map((x) => x.message)[0]).toBe(
      "$t('s.hello'): no i18n/*.json file found",
    );
  });
});
