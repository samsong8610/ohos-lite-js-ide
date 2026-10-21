/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CompletionItemKind, DiagnosticSeverity, InsertTextFormat } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SchemaLoadError } from '@ohjs/schemas';
import { fixtureSchema } from '../test/fixture-schema';
import { normalizeSdkVersion, SchemaRegistry } from './schema-registry';
import { documentKind, OhjsLanguageService } from './service';

const hml = (text: string, version = 1) =>
  TextDocument.create('file:///p/pages/index/index.hml', 'hml', version, text);

describe('SchemaRegistry', () => {
  it('normalizes versions and lists the bundled packs', () => {
    expect(normalizeSdkVersion(' 6.1-LTS ')).toBe('6.1-lts');
    expect(normalizeSdkVersion('v5.0.3')).toBe('5.0.3');
    const r = new SchemaRegistry();
    expect(r.versions()).toEqual(['5.0.3', '6.1-lts']);
    expect(r.version).toBe('5.0.3');
    expect(r.active.ohVersion).toBe('5.0.3');
    expect(r.setVersion('6.1-LTS').provisional).toBe(true);
    expect(r.version).toBe('6.1-lts');
    expect(r.active).toBe(r.setVersion('6.1-lts')); // cached
  });
  it('keeps the previous version when a pack is missing', () => {
    const r = new SchemaRegistry(undefined, '5.0.3');
    expect(() => r.setVersion('9.9')).toThrow(SchemaLoadError);
    expect(r.version).toBe('5.0.3');
  });
  it('reads packs from a custom directory', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ls-'));
    fs.mkdirSync(path.join(d, 'v9.9'));
    fs.writeFileSync(path.join(d, 'v9.9', 'components.json'), JSON.stringify(fixtureSchema()));
    const r = new SchemaRegistry(d, '9.9');
    expect(r.versions()).toEqual(['9.9']);
    expect(Object.keys(r.active.components)).toContain('free');
    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe('documentKind', () => {
  it('uses languageId, then the extension', () => {
    expect(documentKind({ languageId: 'hml', uri: 'file:///a.txt' })).toBe('hml');
    expect(documentKind({ languageId: 'plaintext', uri: 'file:///A.HML' })).toBe('hml');
    expect(documentKind({ languageId: 'css', uri: 'x' })).toBe('css');
    expect(documentKind({ languageId: 'x', uri: 'file:///a.less' })).toBe('css');
    expect(documentKind({ languageId: 'javascript', uri: 'x' })).toBe('js');
    expect(documentKind({ languageId: 'x', uri: 'file:///a.js' })).toBe('js');
    expect(documentKind({ languageId: 'json', uri: 'file:///a.json' })).toBeUndefined();
  });
});

describe('OhjsLanguageService', () => {
  it('validates HML into LSP diagnostics with positions, code and source', () => {
    const s = new OhjsLanguageService(new SchemaRegistry());
    const [d] = s.validate(hml('<div>\r\n  <button></button>\r\n</div>'));
    expect(d).toEqual({
      range: { start: { line: 1, character: 3 }, end: { line: 1, character: 9 } },
      severity: DiagnosticSeverity.Error,
      source: 'ohjs',
      code: 'hml/unknown-component',
      message: expect.stringContaining('<button>'),
    });
    expect(s.validate(TextDocument.create('file:///a.css', 'css', 1, '.a{}'))).toEqual([]);
  });
  it('maps every severity and honours rule settings', () => {
    const s = new OhjsLanguageService(new SchemaRegistry(), {
      rules: { 'hml/unknown-component': 'hint', 'hml/syntax': 'information' },
    });
    expect(s.validate(hml('<foo></foo><div>')).map((d) => d.severity)).toEqual([
      DiagnosticSeverity.Information,
      DiagnosticSeverity.Hint,
    ]);
    s.settings = { rules: { 'hml/for-with-if': 'error' } };
    expect(s.validate(hml('<div for="{{a}}" if="{{b}}"></div>', 2))[0]!.severity).toBe(
      DiagnosticSeverity.Error,
    );
    expect(
      s.validate(hml('<div for="{{a}}" if="{{b}}" onclick=""></div>', 3)).map((d) => d.severity),
    ).toEqual([DiagnosticSeverity.Error, DiagnosticSeverity.Warning]);
  });
  it('completes with text edits, snippet format and markdown docs', () => {
    const s = new OhjsLanguageService(new SchemaRegistry());
    const doc = hml('<list>\n  <\n</list>');
    const items = s.complete(doc, { line: 1, character: 3 });
    expect(items.map((i) => i.label)).toEqual(['list-item']);
    expect(items[0]).toMatchObject({
      kind: CompletionItemKind.Class,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: { start: { line: 1, character: 3 }, end: { line: 1, character: 3 } },
        newText: 'list-item$1>$0</list-item>',
      },
    });
    const attrs = s.complete(hml('<text ', 2), { line: 0, character: 6 });
    expect(attrs.find((i) => i.label === 'onclick')!.kind).toBe(CompletionItemKind.Event);
    expect(attrs.find((i) => i.label === 'for')!.kind).toBe(CompletionItemKind.Keyword);
    expect(attrs.find((i) => i.label === 'id')!.kind).toBe(CompletionItemKind.Property);
    const close = s.complete(hml('<div></', 3), { line: 0, character: 7 });
    expect(close[0]).toMatchObject({
      kind: CompletionItemKind.Property,
      insertTextFormat: InsertTextFormat.PlainText,
    });
    const withDoc = s.complete(hml('<image s', 4), { line: 0, character: 8 }).find((i) => i.label === 'src');
    expect(withDoc?.documentation).toMatchObject({ kind: 'markdown' });
    expect(
      s.complete(TextDocument.create('file:///a.js', 'javascript', 1, ''), { line: 0, character: 0 }),
    ).toEqual([]);
  });
  it('switches SDK version and re-parses only on new document versions', () => {
    const s = new OhjsLanguageService(new SchemaRegistry());
    expect(s.sdkVersion).toBe('5.0.3');
    s.setSdkVersion('6.1-LTS');
    expect(s.sdkVersion).toBe('6.1-lts');
    expect(() => s.setSdkVersion('0.0')).toThrow();
    expect(s.sdkVersion).toBe('6.1-lts');
    const d1 = hml('<foo></foo>', 1);
    expect(s.validate(d1)).toHaveLength(1);
    // same uri + version → cached parse (content ignored)
    expect(s.validate(TextDocument.create(d1.uri, 'hml', 1, '<div></div>'))).toHaveLength(1);
    expect(s.validate(TextDocument.create(d1.uri, 'hml', 2, '<div></div>'))).toHaveLength(0);
    s.forget(d1.uri);
    expect(s.validate(TextDocument.create(d1.uri, 'hml', 2, '<foo></foo>'))).toHaveLength(1);
  });
});

describe('OhjsLanguageService: page companions (.js ViewModel, .hml for CSS)', () => {
  const files = new Map<string, string>();
  const svc = new OhjsLanguageService(new SchemaRegistry(), {}, { read: (u) => files.get(u) });
  it('companionUri', async () => {
    const { companionUri } = await import('./service');
    expect(companionUri('file:///a/b/index.hml', 'js')).toBe('file:///a/b/index.js');
    expect(companionUri('file:///a/b.c/index.css', 'hml')).toBe('file:///a/b.c/index.hml');
  });
  it('completes {{ }} from the same-name .js and caches by text', () => {
    files.set('file:///p/pages/index/index.js', 'export default { data: { msg: 1 }, tap: function () {} };');
    const items = svc.complete(hml('<text>{{}}</text>'), { line: 0, character: 8 });
    expect(items.map((i) => [i.label, i.kind])).toEqual([
      ['msg', CompletionItemKind.Variable],
      ['tap', CompletionItemKind.Method],
      ['$t', CompletionItemKind.Function],
    ]);
    const vm = svc.viewModel('file:///p/pages/index/index.hml');
    expect(svc.viewModel('file:///p/pages/index/index.hml')).toBe(vm);
    files.set('file:///p/pages/index/index.js', 'export default { data: { other: 1 } };');
    expect(svc.viewModel('file:///p/pages/index/index.hml')!.data).toEqual(['other']);
    expect(svc.viewModel('file:///q/none.hml')).toBeUndefined();
  });
  it('CSS: diagnostics (not for LESS) and property completion using the hml', () => {
    const css = TextDocument.create('file:///p/pages/index/index.css', 'css', 1, '.l:hover { }');
    const d = svc.validate(css);
    expect(d).toEqual([
      expect.objectContaining({
        code: 'css/unsupported-pseudo',
        severity: DiagnosticSeverity.Error,
        source: 'ohjs',
      }),
    ]);
    expect(svc.validate(TextDocument.create('file:///p/a.less', 'less', 1, '.a { &:hover {} }'))).toEqual([]);
    expect(svc.validate(TextDocument.create('file:///p/a.js', 'javascript', 1, 'x'))).toEqual([]);
    files.set('file:///p/pages/index/index.hml', '<list class="l"></list>');
    const items = svc.complete(css, { line: 0, character: 11 });
    const fd = items.find((i) => i.label === 'flex-direction')!;
    expect(fd).toMatchObject({
      kind: CompletionItemKind.Property,
      detail: '<list>',
      textEdit: { newText: 'flex-direction: ' },
    });
    expect(items.some((i) => i.label === 'text-overflow')).toBe(false);
    files.delete('file:///p/pages/index/index.hml');
    expect(svc.complete(css, { line: 0, character: 11 }).some((i) => i.label === 'text-overflow')).toBe(true);
    svc.forget(css.uri);
    expect(
      svc.complete(TextDocument.create('file:///p/a.js', 'javascript', 1, 'x'), { line: 0, character: 0 }),
    ).toEqual([]);
    expect(InsertTextFormat.PlainText).toBe(1);
  });
});

describe('OhjsLanguageService: ES5.1, config.json and i18n (FR-LANG-007/008)', () => {
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
  it('documentKind recognises config.json and i18n files', () => {
    expect(documentKind({ languageId: 'json', uri: `${M}config.json` })).toBe('config');
    expect(documentKind({ languageId: 'json', uri: `${M}js/default/i18n/en-US.json` })).toBe('i18n');
    expect(documentKind({ languageId: 'json', uri: `${M}js/default/data.json` })).toBeUndefined();
  });
  it('js/es6-syntax on page scripts, with suppression comments and settings', () => {
    const js = doc(
      'js/default/pages/index/index.js',
      'javascript',
      'export default {\n  onInit() {\n    let a = 1;\n  }\n};\n// ohjs-disable-next-line js/es6-syntax\nconst b = 2;',
    );
    const d = svc.validate(js);
    expect(d.map((x) => [x.code, x.severity, x.range.start.line, x.message])).toEqual([
      [
        'js/es6-syntax',
        DiagnosticSeverity.Error,
        1,
        'Method shorthand (ES2015+) cannot be used: the engine runs ES5.1',
      ],
      [
        'js/es6-syntax',
        DiagnosticSeverity.Error,
        2,
        "'let' declarations (ES2015+) cannot be used: the engine runs ES5.1",
      ],
    ]);
    svc.settings = { rules: { 'js/es6-syntax': 'warning' } };
    expect(svc.validate(js)[0]!.severity).toBe(DiagnosticSeverity.Warning);
    svc.settings = { rules: { 'js/es6-syntax': 'off' } };
    expect(svc.validate(js)).toEqual([]);
    svc.settings = {};
    expect(svc.validate(doc('js/default/i18n/en-US.json', 'json', '{}'))).toEqual([]);
  });
  it('config.json: deviceType and page files resolved through the reader', () => {
    files.set(`${M}js/default/pages/index/index.hml`, '<div></div>');
    const cfg = doc(
      'config.json',
      'json',
      '{ "app": {}, "module": { "deviceType": ["SmartVision"], "js": [{ "pages": ["pages/index/index", "pages/b/b"] }] } }',
    );
    expect(svc.validate(cfg).map((x) => [x.code, x.range.start.character])).toEqual([
      ['prj/device-type', 40],
      ['prj/page-file-missing', 96],
    ]);
    svc.settings = { rules: { 'prj/device-type': 'off' } };
    expect(svc.validate(cfg).map((x) => x.code)).toEqual(['prj/page-file-missing']);
    svc.settings = {};
  });
  it('HML: page registration and $t keys from config.json and i18n/*.json', () => {
    files.set(
      `${M}config.json`,
      '{ "app": {}, "module": { "deviceType": ["smartVision"], "js": [{ "name": "default", "pages": ["pages/index/index"] }] } }',
    );
    files.set(`${M}js/default/i18n/en-US.json`, '{ "strings": { "hello": "Hi", "bye": "Bye" } }');
    files.set(`${M}js/default/i18n/zh-CN.json`, '{ "strings": { "hello": "你好" } }');
    const page = doc(
      'js/default/pages/other/other.hml',
      'hml',
      `<div><text>{{ $t('strings.hello') }}{{ $t('strings.bye') }}{{ $t('nope') }}</text></div>`,
    );
    expect(svc.validate(page).map((x) => x.code)).toEqual([
      'prj/page-not-registered',
      'i18n/missing-translation',
      'i18n/missing-key',
    ]);
    expect(svc.i18n(page.uri)!.get('zh-CN.json')).toEqual(new Set(['strings.hello']));
    expect(svc.i18n('file:///tmp/x.hml')).toBeUndefined();
    const keys = svc.complete(doc('js/default/pages/index/index.hml', 'hml', "<text>{{ $t('') }}</text>"), {
      line: 0,
      character: 13,
    });
    expect(keys.map((k) => [k.label, k.kind])).toEqual([
      ['strings.bye', CompletionItemKind.Constant],
      ['strings.hello', CompletionItemKind.Constant],
    ]);
    // outside an FA tree: no project rules
    expect(
      svc.validate(TextDocument.create('file:///tmp/x.hml', 'hml', 1, "<text>{{ $t('nope') }}</text>")),
    ).toEqual([]);
    // a reader without list(): no i18n checks
    const plain = new OhjsLanguageService(new SchemaRegistry(), {}, { read: reader.read });
    expect(plain.validate(page).map((x) => x.code)).toEqual(['prj/page-not-registered']);
  });
});
