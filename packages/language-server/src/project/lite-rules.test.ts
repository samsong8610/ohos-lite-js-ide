/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { loadComponentsSchema } from '@ohjs/schemas';
import { parseCss } from '../css/parser';
import { completeCss, validateCss } from '../css/css-features';
import { completeHml, completionContext } from '../hml/completion';
import { validateHml } from '../hml/diagnostics';
import { parseHml } from '../hml/parser';
import { SchemaView } from '../hml/schema-view';
import { checkEs5 } from '../js/es5';
import { checkFeatureMethods, methodCalls } from '../js/feature-methods';
import { SchemaRegistry } from '../schema-registry';
import { OhjsLanguageService } from '../service';
import { validateConfig } from './config';
import { i18nKeyRange } from './i18n';
import { checkImagePath, cssUrls } from './images';

const schema = loadComponentsSchema('5.0.3');
const view = new SchemaView(schema);
const EXT = schema.aceLoader.imageExtensions;

describe('res/image-format', () => {
  it('checkImagePath: bmp/jpeg/jpg/png any case; skips bound, data:, extension-less', () => {
    const r = { start: 0, end: 1 };
    for (const ok of [
      '/common/a.png',
      'b.JPG',
      'c.jpeg?x=1',
      'd.bmp#f',
      '{{img}}',
      'data:image/gif;base64,x',
      '/common/noext',
      '',
    ])
      expect(checkImagePath(ok, r, EXT)).toBeUndefined();
    expect(checkImagePath('/common/a.gif', r, EXT)!.message).toBe(
      'Image format ".gif" is not supported by ArkUI.Lite (use .bmp, .jpeg, .jpg, .png)',
    );
    expect(checkImagePath('internal://app/x.webp', r, EXT)).toBeDefined();
  });
  it('HML <image src> (not <video src>) and CSS url()', () => {
    const t =
      '<div><image src="/common/a.gif"></image><image src="/common/b.png"></image><video src="a.mp4"></video></div>';
    const d = validateHml(parseHml(t), view).filter((x) => x.rule === 'res/image-format');
    expect(d.map((x) => t.slice(x.range.start, x.range.end))).toEqual(['/common/a.gif']);
    const css =
      '.a { background-image: url("/common/x.svg"); }\n.b { background-image: url(/common/y.png); }\n@keyframes k { from { background-image: url(z.gif); } }';
    const cd = validateCss(parseCss(css), { imageExtensions: EXT });
    expect(cd.map((x) => css.slice(x.range.start, x.range.end))).toEqual(['/common/x.svg', 'z.gif']);
    expect(validateCss(parseCss(css))).toEqual([]);
    expect(cssUrls("url( 'a.png' ) url()")).toEqual([
      { url: 'a.png', start: 6, end: 11 },
      { url: '', start: 19, end: 19 },
    ]);
  });
});

describe('prj/page-name-conflict', () => {
  it('page file names equal to a component tag', () => {
    const cfg =
      '{ "app": {}, "module": { "deviceType": ["smartVision"], "js": [{ "pages": ["pages/index/index", "pages/text/text", "pages/list/list", "pages/my-list/my-list"] }] } }';
    const tags = new Set(Object.keys(schema.components));
    const f = validateConfig(cfg, () => true, tags);
    expect(f.map((x) => [x.rule, cfg.slice(x.range.start, x.range.end)])).toEqual([
      ['prj/page-name-conflict', '"pages/text/text"'],
      ['prj/page-name-conflict', '"pages/list/list"'],
    ]);
    expect(f[0]!.message).toContain('reserved tag name');
    expect(validateConfig(cfg, () => true)).toEqual([]);
  });
});

describe('feature/rotation-disabled', () => {
  const calls = (code: string) => methodCalls(checkEs5(code).ast!);
  it('collects $refs method calls', () => {
    const c = calls(
      "this.$refs.l.rotation({ focus: true }); this.$refs['s'].rotation(); a.rotation(); this.$refs[k].rotation(); f(); x[y](); this.$refs.l.scrollTo({ index: 1 }); this['$refs'].q.rotation();",
    );
    expect(c.map((x) => [x.method, x.ref])).toEqual([
      ['rotation', 'l'],
      ['rotation', 's'],
      ['rotation', undefined],
      ['rotation', undefined],
      ['scrollTo', 'l'],
      ['rotation', undefined],
    ]);
  });
  it('reports rotation() on refs resolving to list/swiper/slider/picker-view or unresolved refs', () => {
    const code =
      'this.$refs.l.rotation(); this.$refs.unknown.rotation(); this.$refs.d.rotation(); this.$refs.t.rotation(); a.rotation();';
    const refs = new Map([
      ['l', 'list'],
      ['d', 'div'],
      ['t', 'not-a-tag'],
    ]);
    const f = checkFeatureMethods(calls(code), schema, refs);
    expect(f.map((x) => x.range.start)).toEqual([
      code.indexOf('l.rotation') + 2,
      code.indexOf('unknown.rotation') + 8,
    ]);
    expect(code.slice(f[0]!.range.start, f[0]!.range.end)).toBe('rotation');
    expect(f[0]!.message).toBe(
      'rotation() is not available on target linux: FEATURE_ROTATION_API is off (<list>), so the call fails at runtime',
    );
    expect(f[1]!.message).not.toContain('(<');
    const enabled = structuredClone(schema);
    for (const c of Object.values(enabled.components))
      if (c.methods['rotation']) c.methods['rotation'].availability = 'code';
    expect(checkFeatureMethods(calls(code), enabled, refs)).toEqual([]);
    const noFeature = structuredClone(schema);
    delete noFeature.components['list']!.methods['rotation']!.feature;
    for (const t of ['swiper', 'slider', 'picker-view']) delete noFeature.components[t]!.methods['rotation'];
    expect(checkFeatureMethods(calls(code), noFeature, refs)[0]!.message).toContain(
      'its feature switch is off',
    );
  });
});

describe('enum value completion (FR-LANG-004)', () => {
  const at = (t: string, marker = '|') => {
    const o = t.indexOf(marker);
    return { text: t.slice(0, o) + t.slice(o + 1), offset: o };
  };
  it('HML attribute values from code (type variants) and docs', () => {
    const { text, offset } = at('<input type="ch|"></input>');
    const doc = parseHml(text);
    const items = completeHml(doc, offset, view);
    expect(items.map((i) => i.label)).toEqual(['checkbox', 'radio', 'text', 'password', 'button']);
    expect(items[0]).toMatchObject({
      kind: 'enumValue',
      replace: { start: 13, end: 15 },
      detail: 'type value',
    });
    const b = at('<switch checked="|"></switch>');
    const sw = completeHml(parseHml(b.text), b.offset, view);
    expect(sw.map((i) => [i.label, i.detail])).toEqual([
      ['true', 'checked value (from docs)'],
      ['false', 'checked value (from docs)'],
    ]);
    const bound = at('<switch checked="{{|"></switch>');
    expect(completionContext(parseHml(bound.text), bound.offset).kind).toBe('expression');
    const mixed = at('<switch checked="{{a}} |"></switch>');
    expect(completeHml(parseHml(mixed.text), mixed.offset, view)).toEqual([]);
    const dash = at('<progress type="hori|zon"></progress>');
    expect(completeHml(parseHml(dash.text), dash.offset, view)[0]!.replace).toEqual({ start: 16, end: 23 });
  });
  it('CSS values after `property:` (common and component styles)', () => {
    const c = (src: string, hml?: string) => {
      const { text, offset } = at(src);
      return completeCss(parseCss(text), offset, view, hml ? parseHml(hml) : undefined);
    };
    expect(c('.a { display: | }').map((i) => i.label)).toEqual(['flex', 'none']);
    expect(c('.a { flex-direction:fl| }').map((i) => [i.label, i.kind])).toContainEqual(['column', 'value']);
    expect(c('.a { justify-content: center | }')).toEqual([]);
    expect(c('.a { color: | }')).toEqual([]);
    expect(c('.a { text-align: | }', '<text class="a"></text>').map((i) => i.label)).toEqual([
      'left',
      'center',
      'right',
    ]);
    expect(c('.a { text-align: | }', '<div class="a"></div>')).toEqual([]);
    expect(c('.a { disp| }')[0]!.kind).toBeUndefined();
  });
  it('service maps values to EnumMember without the ": " suffix', () => {
    const svc = new OhjsLanguageService(new SchemaRegistry());
    const css = TextDocument.create('file:///p/pages/index/index.css', 'css', 1, '.a { display:  }');
    const items = svc.complete(css, { line: 0, character: 14 });
    expect(items[0]).toMatchObject({
      label: 'flex',
      kind: CompletionItemKind.EnumMember,
      textEdit: { newText: 'flex' },
    });
    const h = TextDocument.create('file:///p/pages/index/index.hml', 'hml', 1, '<input type=""></input>');
    expect(svc.complete(h, { line: 0, character: 13 })[0]).toMatchObject({
      label: 'checkbox',
      kind: CompletionItemKind.EnumMember,
    });
  });
});

describe('service: new rules and i18n jump', () => {
  const M = 'file:///w/entry/src/main/';
  const files = new Map<string, string>();
  const reader = {
    read: (u: string) => files.get(u),
    list: (dir: string) => {
      const names = [...files.keys()]
        .filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/'))
        .map((k) => k.slice(dir.length));
      return names.length ? names : undefined;
    },
  };
  const svc = new OhjsLanguageService(new SchemaRegistry(), {}, reader);
  const doc = (rel: string, lang: string, text: string) => TextDocument.create(M + rel, lang, 1, text);
  it('rotation via the page .hml refs; css images; config conflicts', () => {
    files.set(
      `${M}js/default/pages/index/index.hml`,
      '<div><list ref="l"></list><div ref="{{x}}"></div><div ref></div></div>',
    );
    const js = svc.validate(
      doc(
        'js/default/pages/index/index.js',
        'javascript',
        'export default { f: function () { this.$refs.l.rotation({ focus: true }); } };',
      ),
    );
    expect(js.map((d) => [d.code, d.severity])).toEqual([['feature/rotation-disabled', 2]]);
    expect(
      svc.validate(doc('js/default/app.js', 'javascript', 'this.$refs.x.rotation();')).map((d) => d.code),
    ).toEqual(['feature/rotation-disabled']);
    expect(
      svc
        .validate(doc('js/default/pages/index/index.css', 'css', '.a { background-image: url(a.gif); }'))
        .map((d) => d.code),
    ).toEqual(['res/image-format']);
    const cfg = svc.validate(
      doc(
        'config.json',
        'json',
        '{ "app": {}, "module": { "deviceType": ["smartVision"], "js": [{ "pages": ["pages/index/index", "pages/swiper/swiper"] }] } }',
      ),
    );
    expect(cfg.map((d) => d.code)).toEqual(['prj/page-name-conflict', 'prj/page-file-missing']);
  });
  it("definition: $t('a.b') → key in each locale file; other positions / kinds → []", () => {
    files.set(`${M}js/default/i18n/en-US.json`, '{\n  "strings": {\n    "hello": "Hi"\n  }\n}');
    files.set(`${M}js/default/i18n/zh-CN.json`, '{ "other": 1 }');
    files.set(`${M}js/default/i18n/notes.txt`, 'x');
    const page = doc('js/default/pages/index/index.hml', 'hml', "<text>{{ $t('strings.hello') }}</text>");
    expect(svc.definition(page, { line: 0, character: 16 })).toEqual([
      {
        uri: `${M}js/default/i18n/en-US.json`,
        range: { start: { line: 2, character: 4 }, end: { line: 2, character: 11 } },
      },
    ]);
    expect(svc.definition(page, { line: 0, character: 2 })).toEqual([]);
    expect(svc.definition(doc('js/default/a.js', 'javascript', ''), { line: 0, character: 0 })).toEqual([]);
    const outside = TextDocument.create('file:///x/index.hml', 'hml', 1, "<text>{{ $t('a') }}</text>");
    expect(svc.definition(outside, { line: 0, character: 14 })).toEqual([]);
    const noList = new OhjsLanguageService(new SchemaRegistry(), {}, { read: reader.read });
    expect(noList.definition(page, { line: 0, character: 16 })).toEqual([]);
  });
  it('i18nKeyRange', () => {
    expect(i18nKeyRange('{ "a": { "b": "x" } }', 'a.b')).toEqual({ start: 9, end: 12 });
    expect(i18nKeyRange('{ "a": 1 }', 'a.b')).toBeUndefined();
    expect(i18nKeyRange('', 'a')).toBeUndefined();
    expect(i18nKeyRange('[1]', '0')).toBeUndefined();
  });
});
