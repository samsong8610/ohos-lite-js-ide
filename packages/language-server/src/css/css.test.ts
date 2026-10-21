/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadComponentsSchema } from '@ohjs/schemas';
import { fixtureSchema } from '../../test/fixture-schema';
import { parseHml } from '../hml/parser';
import { SchemaView } from '../hml/schema-view';
import { completeCss, matchedTags, validateCss } from './css-features';
import { parseCss, selectorTargets } from './parser';

describe('parseCss', () => {
  it('rules, selectors with exact ranges, declarations, comments, at-rules', () => {
    const t =
      '@import \'../common/a.css\';\n/* c { } */\n.a, #b:active {\n  color: red;\n  width: 10px\n}\n@media (width: 100) { .m { height: 1px; } }\n@keyframes k { from { opacity: 0; } to { opacity: 1; } }\n.s { content: "x;}"; }';
    const d = parseCss(t);
    expect(d.comments).toEqual([{ text: ' c { } ', range: { start: 27, end: 38 } }]);
    expect(d.rules.map((r) => [r.selectors.map((s) => s.text), r.inKeyframes])).toEqual([
      [['.a', '#b:active'], false],
      [['.m'], false],
      [['from'], true],
      [['to'], true],
      [['.s'], false],
    ]);
    const a = d.rules[0]!;
    expect(t.slice(a.selectors[1]!.range.start, a.selectors[1]!.range.end)).toBe('#b:active');
    expect(a.declarations.map((x) => [x.property, x.value])).toEqual([
      ['color', 'red'],
      ['width', '10px'],
    ]);
    expect(t.slice(a.declarations[1]!.propertyRange.start, a.declarations[1]!.propertyRange.end)).toBe(
      'width',
    );
    expect(t.slice(a.declarations[0]!.valueRange.start, a.declarations[0]!.valueRange.end)).toBe('red');
    expect(d.rules[4]!.declarations[0]!.value).toBe('"x;}"');
  });
  it('is tolerant of unclosed blocks, comments, strings and junk', () => {
    const d = parseCss('.a { color: red; .b { :x; 1bad: 2; height');
    expect(d.rules.map((r) => r.selectors[0]!.text)).toEqual(['.a', '.b']);
    expect(d.rules[0]!.block.end).toBe(d.text.length);
    expect(d.rules[1]!.declarations).toEqual([]);
    expect(parseCss('/* open').comments[0]!.text).toBe(' open');
    expect(parseCss('.a { content: "open').rules[0]!.declarations[0]!.property).toBe('content');
    expect(parseCss('} .x {}').rules[0]!.selectors[0]!.text).toBe('.x');
    expect(parseCss(', .y {}').rules[0]!.selectors.map((s) => s.text)).toEqual(['.y']);
  });
  it('selectorTargets', () => {
    expect(selectorTargets('.a.b#c:active')).toEqual({ classes: ['a', 'b'], ids: ['c'] });
  });
});

describe('validateCss (selector and pseudo-class rules)', () => {
  const rules = (t: string, r?: Record<string, unknown>) =>
    validateCss(parseCss(t), r ? { rules: r } : {}).map((d) => d.rule);
  it('accepts .class, #id, lists and :active / :checked', () => {
    expect(rules('.a, #b {} .btn:active {} #c:checked {} @keyframes k { 0% {} 50%{} }')).toEqual([]);
  });
  it('css/unsupported-selector: descendant, child, sibling, attribute, universal, tag, compound', () => {
    const d = validateCss(
      parseCss('.a .b {} .a>.b {} .a + .b {} .a ~ .b {} [x] {} * {} text {} .a.b {} #a.b {}'),
    );
    expect(d.map((x) => x.message.replace(/^Unsupported selector "[^"]*": /, ''))).toEqual([
      'combinators (descendant, child, sibling) are not supported',
      'combinators (descendant, child, sibling) are not supported',
      'combinators (descendant, child, sibling) are not supported',
      'combinators (descendant, child, sibling) are not supported',
      'attribute selectors are not supported',
      'the universal selector is not supported',
      'tag selectors are not supported',
      'only a single .class or #id is supported',
      'only a single .class or #id is supported',
    ]);
    expect(d[0]).toMatchObject({
      rule: 'css/unsupported-selector',
      severity: 'error',
      range: { start: 0, end: 5 },
    });
  });
  it('css/unsupported-pseudo', () => {
    const t = '.a:hover {} .b::before {} .c:nth-child(2) {} .d:focus, .e:active {}';
    const d = validateCss(parseCss(t));
    expect(d.map((x) => x.rule)).toEqual([
      'css/unsupported-pseudo',
      'css/unsupported-pseudo',
      'css/unsupported-pseudo',
      'css/unsupported-pseudo',
    ]);
    expect(t.slice(d[0]!.range.start, d[0]!.range.end)).toBe(':hover');
    expect(d[1]!.message).toContain('"::before"');
  });
  it('rule switches and /* ohjs-disable */ comments', () => {
    expect(rules('text {}', { 'css/unsupported-selector': 'off' })).toEqual([]);
    expect(
      validateCss(parseCss('text {}'), { rules: { 'css/unsupported-selector': 'warning' } })[0]!.severity,
    ).toBe('warning');
    expect(rules('/* ohjs-disable css/unsupported-pseudo */\n.a:hover {} text {}')).toEqual([
      'css/unsupported-selector',
    ]);
    expect(rules('/* ohjs-disable-next-line */\ntext {}\ndiv {}')).toEqual(['css/unsupported-selector']);
  });
});

describe('completeCss (FR-LANG-005)', () => {
  const view = new SchemaView(loadComponentsSchema('5.0.3'));
  const at = (marked: string) => {
    const offset = marked.indexOf('|');
    return { doc: parseCss(marked.slice(0, offset) + marked.slice(offset + 1)), offset };
  };
  const hml = parseHml(
    '<div class="page"><list class="l a" id="L"><list-item class="li"></list-item></list><text class="{{dyn}}"></text></div>',
  );
  it('styles of the components the selector hits, plus common styles', () => {
    const { doc, offset } = at('.l {\n  fl|\n}');
    const items = completeCss(doc, offset, view, hml);
    const names = items.map((i) => i.label);
    expect(names).toContain('flex-direction');
    expect(names).toContain('width');
    expect(names).not.toContain('text-overflow'); // a <text> style; .l only hits <list>
    expect(items.find((i) => i.label === 'flex-direction')).toMatchObject({
      detail: '<list>',
      replace: { start: 7, end: 9 },
    });
    expect(items.find((i) => i.label === 'width')!.detail).toBe('common style');
    expect(items.find((i) => i.label === 'flex-direction')!.documentation).toContain('column');
    expect(matchedTags(doc.rules[0]!, hml)).toEqual(['list']);
  });
  it('#id selectors and selector lists take the union', () => {
    const { doc, offset } = at('#L, .li { | }');
    expect(matchedTags(doc.rules[0]!, hml)).toEqual(['list', 'list-item']);
    const items = completeCss(doc, offset, view, hml);
    expect(items.find((i) => i.label === 'flex-direction')!.detail).toBe('<list> <list-item>');
    expect(items.find((i) => i.label === 'justify-content')!.detail).toBe('<list-item>');
  });
  it('no match or no HML: every usable style; disabled styles hidden', () => {
    const { doc, offset } = at('.nothing { | }');
    const all = completeCss(doc, offset, view, hml).map((i) => i.label);
    expect(all).toContain('text-overflow');
    expect(all).not.toContain('spannablestyle'); // FEATURE_COMPONENT_TEXT_SPANNABLE is off
    expect(completeCss(doc, offset, view).map((i) => i.label)).toEqual(all);
  });
  it('only at a property-name position inside a block', () => {
    const c = (m: string) => {
      const { doc, offset } = at(m);
      return completeCss(doc, offset, view, hml).length;
    };
    expect(c('.l { color: re| }')).toBe(0);
    expect(c('.l| { }')).toBe(0);
    expect(c('|')).toBe(0);
    expect(c('.l { color: red; wi| }')).toBeGreaterThan(0);
    expect(c('.l {|}')).toBeGreaterThan(0);
    expect(c('@keyframes k { from { op| } }')).toBeGreaterThan(0);
  });
  it('fixture schema: tag without styles still offers common styles', () => {
    const v = new SchemaView(fixtureSchema());
    const { doc, offset } = at('.x { | }');
    expect(completeCss(doc, offset, v, parseHml('<div class="x"></div>'))).toEqual([]);
  });
});
