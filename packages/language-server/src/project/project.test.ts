/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { parseHml } from '../hml/parser';
import { readConfig, validateConfig } from './config';
import { i18nKeys, interpolations, translationRefs } from './i18n';
import { mainUriOfConfig, moduleLayout } from './layout';

describe('moduleLayout', () => {
  it('splits FA module URIs (Windows file URIs included)', () => {
    expect(moduleLayout('file:///c%3A/w/p/entry/src/main/js/default/pages/index/index.hml')).toEqual({
      mainUri: 'file:///c%3A/w/p/entry/src/main/',
      configUri: 'file:///c%3A/w/p/entry/src/main/config.json',
      jsName: 'default',
      jsRootUri: 'file:///c%3A/w/p/entry/src/main/js/default/',
      i18nDirUri: 'file:///c%3A/w/p/entry/src/main/js/default/i18n/',
      rel: 'pages/index/index.hml',
      page: 'pages/index/index',
    });
    expect(moduleLayout('file:///p/src/main/js/MainAbility/common/c.hml')).toMatchObject({
      jsName: 'MainAbility',
      rel: 'common/c.hml',
    });
    expect(moduleLayout('file:///p/src/main/js/default/common/c.hml')!.page).toBeUndefined();
    expect(moduleLayout('file:///tmp/a.hml')).toBeUndefined();
    expect(mainUriOfConfig('file:///p/entry/src/main/config.json')).toBe('file:///p/entry/src/main/');
    expect(mainUriOfConfig('file:///p/config.json')).toBeUndefined();
  });
});

const CONFIG = (module: string) => `{
  "app": { "bundleName": "com.example.demo", "vendor": "example", "version": { "code": 1, "name": "1.0" } },
  "deviceConfig": {},
  "module": ${module}
}`;
const GOOD = `{ "deviceType": ["smartVision"], "js": [{ "name": "default", "pages": ["pages/index/index", "pages/detail/detail"] }] }`;
const all = () => true;
const rules = (text: string, exists: (j: string, p: string) => boolean = all) =>
  validateConfig(text, exists).map((f) => f.rule);

describe('validateConfig (FR-LANG-008, FR-BLD-008)', () => {
  it('accepts a correct config.json', () => {
    expect(validateConfig(CONFIG(GOOD), all)).toEqual([]);
    expect(readConfig(CONFIG(GOOD))!.pages.get('default')).toEqual([
      'pages/index/index',
      'pages/detail/detail',
    ]);
  });
  it('deviceType must be exactly "smartVision"', () => {
    const t = CONFIG(`{ "deviceType": ["smartvision"], "js": [{ "pages": ["pages/index/index"] }] }`);
    const [f] = validateConfig(t, all);
    expect(f).toMatchObject({ rule: 'prj/device-type' });
    expect(f!.message).toContain('case-sensitive');
    expect(t.slice(f!.range.start, f!.range.end)).toBe('"smartvision"');
    expect(
      validateConfig(
        CONFIG(`{ "deviceType": ["liteWearable"], "js": [{ "pages": ["pages/index/index"] }] }`),
        all,
      )[0]!.message,
    ).toContain('must contain');
    expect(
      validateConfig(
        CONFIG(`{ "deviceType": "smartVision", "js": [{ "pages": ["pages/index/index"] }] }`),
        all,
      )[0]!.message,
    ).toContain('must be an array');
    const missing = CONFIG(`{ "js": [{ "pages": ["pages/index/index"] }] }`);
    const [m] = validateConfig(missing, all);
    expect(m!.message).toContain('missing');
    expect(missing.slice(m!.range.start, m!.range.end)).toBe('"module"');
  });
  it('pages: present, home page first, files exist', () => {
    expect(rules(CONFIG(`{ "deviceType": ["smartVision"] }`))).toEqual(['prj/missing-pages']);
    expect(rules(CONFIG(`{ "deviceType": ["smartVision"], "js": [{ "pages": [] }] }`))).toEqual([
      'prj/missing-pages',
    ]);
    expect(rules(CONFIG(`{ "deviceType": ["smartVision"], "js": [{ "name": "x" }] }`))).toEqual([
      'prj/missing-pages',
    ]);
    expect(
      rules(
        CONFIG(
          `{ "deviceType": ["smartVision"], "js": [{ "pages": ["pages/main/main", "pages/index/index"] }] }`,
        ),
      ),
    ).toEqual(['prj/first-page-not-index']);
    expect(rules(CONFIG(`{ "deviceType": ["smartVision"], "js": [{ "pages": [1] }] }`))).toEqual([
      'prj/first-page-not-index',
    ]);
    const asked: string[] = [];
    const f = validateConfig(CONFIG(GOOD), (j, p) => (asked.push(`${j}:${p}`), p !== 'pages/detail/detail'));
    expect(asked).toEqual(['default:pages/index/index', 'default:pages/detail/detail']);
    expect(f.map((x) => [x.rule, x.message])).toEqual([
      ['prj/page-file-missing', 'Page "pages/detail/detail" has no js/default/pages/detail/detail.hml'],
    ]);
  });
  it('app/module objects are required; junk input is ignored', () => {
    expect(rules('{ "app": {} }')).toEqual(['prj/missing-app-module']);
    expect(rules('{ "app": 1, "module": [] }')).toEqual(['prj/missing-app-module', 'prj/missing-app-module']);
    expect(rules('[]')).toEqual([]);
    expect(rules('')).toEqual([]);
    expect(readConfig('[]')).toBeUndefined();
    expect(
      readConfig('{"module": {"js": [{"pages": ["a", 2]}, {"name": "w", "pages": ["b"]}, {}]}}')!.pages,
    ).toEqual(
      new Map([
        ['default', ['a']],
        ['w', ['b']],
      ]),
    );
  });
});

describe('i18n', () => {
  it('leaf keys of nested locale files; tolerant of comments and junk', () => {
    expect([
      ...i18nKeys('{ "strings": { "hello": "Hi", "n": { "a": "x" } }, "top": "t", "arr": ["a"] }'),
    ]).toEqual(['strings.hello', 'strings.n.a', 'top', 'arr']);
    expect([...i18nKeys('// c\n{ "a": "b", }')]).toEqual(['a']);
    expect([...i18nKeys('"x"')]).toEqual([]);
  });
  it('interpolations skip comments, unclosed and tag-crossing braces', () => {
    const doc = parseHml(
      '<text>{{ a }}</text><!-- {{ c }} --><text value="{{b}}">{{ x <div>}}</div></text>{{ open',
    );
    expect(
      interpolations(doc).map((i) => [i.expr, doc.text.slice(i.start, i.start + i.expr.length)]),
    ).toEqual([
      [' a ', ' a '],
      ['b', 'b'],
    ]);
  });
  it('literal $t keys with ranges; dynamic keys skipped', () => {
    const doc = parseHml(
      `<text>{{ $t('strings.hello') }} {{ $t("a.b", { n: 1 }) }} {{ $t('x.' + k) }}</text>`,
    );
    expect(translationRefs(doc).map((r) => [r.key, doc.text.slice(r.range.start, r.range.end)])).toEqual([
      ['strings.hello', 'strings.hello'],
      ['a.b', 'a.b'],
    ]);
  });
});
