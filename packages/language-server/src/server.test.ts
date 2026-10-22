/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createConnection,
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type Diagnostic,
  type ProtocolConnection,
  type PublishDiagnosticsParams,
} from 'vscode-languageserver/node';
import {
  SDK_CHANGED_NOTIFICATION,
  SDK_STATUS_NOTIFICATION,
  type InitializationOptions,
  type SdkStatusParams,
} from './protocol';
import { startServer } from './server';

// LSP round-trips over in-memory streams: the server runs exactly as with --stdio, no VS Code involved (FR-LANG-012).
interface Harness {
  client: ProtocolConnection;
  diagnostics: Map<string, Diagnostic[][]>;
  statuses: SdkStatusParams[];
  waitDiagnostics(uri: string, count?: number): Promise<Diagnostic[]>;
  waitStatus(count: number): Promise<SdkStatusParams>;
  config: Record<string, unknown>;
  diag: Record<string, unknown> | undefined;
}

const harnesses: Harness[] = [];
afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    await h.client.sendRequest('shutdown');
    h.client.sendNotification('exit');
    h.client.dispose();
  }
});

async function start(init: InitializationOptions & { configuration?: boolean } = {}): Promise<Harness> {
  const up = new PassThrough();
  const down = new PassThrough();
  const server = createConnection(new StreamMessageReader(up), new StreamMessageWriter(down));
  // the real process exits on 'exit'; keep the test runner alive
  (server as unknown as { onExit(h: () => void): void }).onExit(() => {});
  startServer(server);
  const client = createProtocolConnection(new StreamMessageReader(down), new StreamMessageWriter(up));
  const diagnostics = new Map<string, Diagnostic[][]>();
  const statuses: SdkStatusParams[] = [];
  const waiters: Array<() => void> = [];
  const poke = () => waiters.splice(0).forEach((w) => w());
  const h: Harness = {
    client,
    diagnostics,
    statuses,
    config: {},
    diag: undefined,
    waitDiagnostics: (uri, count = 1) =>
      new Promise((resolve) => {
        const check = () => {
          const l = diagnostics.get(uri) ?? [];
          if (l.length >= count) resolve(l[count - 1]!);
          else waiters.push(check);
        };
        check();
      }),
    waitStatus: (count) =>
      new Promise((resolve) => {
        const check = () => (statuses.length >= count ? resolve(statuses[count - 1]!) : waiters.push(check));
        check();
      }),
  };
  client.onNotification('textDocument/publishDiagnostics', (p: PublishDiagnosticsParams) => {
    diagnostics.set(p.uri, [...(diagnostics.get(p.uri) ?? []), p.diagnostics]);
    poke();
  });
  client.onNotification(SDK_STATUS_NOTIFICATION, (p: SdkStatusParams) => {
    statuses.push(p);
    poke();
  });
  client.onRequest('workspace/configuration', (p: { items: Array<{ section?: string }> }) =>
    p.items.map((i) => (i.section === 'ohjs.diagnostics' ? h.diag : h.config)),
  );
  client.listen();
  const { configuration, ...opts } = init;
  const r = await client.sendRequest('initialize', {
    processId: null,
    rootUri: null,
    capabilities: configuration ? { workspace: { configuration: true } } : {},
    initializationOptions: { debounceMs: 0, ...opts },
  });
  expect((r as { serverInfo: { name: string } }).serverInfo.name).toBe('ohjs-language-server');
  client.sendNotification('initialized', {});
  harnesses.push(h);
  return h;
}

const URI = 'file:///proj/entry/src/main/js/default/pages/index/index.hml';
const open = (h: Harness, text: string, uri = URI) =>
  h.client.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'hml', version: 1, text },
  });

describe('language server over LSP', () => {
  it('advertises incremental sync and completion', async () => {
    const up = new PassThrough();
    const down = new PassThrough();
    const server = createConnection(new StreamMessageReader(up), new StreamMessageWriter(down));
    (server as unknown as { onExit(h: () => void): void }).onExit(() => {});
    startServer(server);
    const client = createProtocolConnection(new StreamMessageReader(down), new StreamMessageWriter(up));
    client.listen();
    const r = (await client.sendRequest('initialize', {
      processId: null,
      rootUri: null,
      capabilities: {},
    })) as {
      capabilities: {
        textDocumentSync: { change: number };
        completionProvider: { triggerCharacters: string[] };
      };
    };
    expect(r.capabilities.textDocumentSync.change).toBe(2);
    expect(r.capabilities.completionProvider.triggerCharacters).toContain('<');
    await client.sendRequest('shutdown');
    client.dispose();
  });

  it('publishes diagnostics on open and after incremental changes; clears on close', async () => {
    const h = await start();
    expect((await h.waitStatus(1)).version).toBe('5.0.3');
    open(h, '<div>\n  <button></button>\n</div>');
    const d1 = await h.waitDiagnostics(URI);
    expect(d1.map((d) => d.code)).toEqual(['hml/unknown-component']);
    expect(d1[0]!.range.start).toEqual({ line: 1, character: 3 });
    h.client.sendNotification('textDocument/didChange', {
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        { range: { start: { line: 1, character: 3 }, end: { line: 1, character: 9 } }, text: 'text' },
      ],
    });
    const d2 = await h.waitDiagnostics(URI, 2);
    expect(d2.map((d) => d.message)).toEqual([
      'Closing tag </button> has no matching start tag',
      '<text> is not closed',
    ]);
    h.client.sendNotification('textDocument/didClose', { textDocument: { uri: URI } });
    expect(await h.waitDiagnostics(URI, 3)).toEqual([]);
  });

  it('answers completion requests', async () => {
    const h = await start();
    open(h, '<list>\n  <\n</list>');
    await h.waitDiagnostics(URI);
    const items = (await h.client.sendRequest('textDocument/completion', {
      textDocument: { uri: URI },
      position: { line: 1, character: 3 },
    })) as Array<{ label: string }>;
    expect(items.map((i) => i.label)).toEqual(['list-item']);
    const none = await h.client.sendRequest('textDocument/completion', {
      textDocument: { uri: 'file:///nope.hml' },
      position: { line: 0, character: 0 },
    });
    expect(none).toEqual([]);
  });

  it('reads the page .js from disk, then from the open buffer; validates CSS', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-srv-'));
    fs.writeFileSync(path.join(dir, 'index.js'), 'export default { data: { fromDisk: 1 } };');
    const hmlUri = pathToFileURL(path.join(dir, 'index.hml')).href;
    const jsUri = pathToFileURL(path.join(dir, 'index.js')).href;
    const cssUri = pathToFileURL(path.join(dir, 'index.css')).href;
    const h = await start();
    open(h, '<text>{{}}</text>', hmlUri);
    await h.waitDiagnostics(hmlUri);
    const labels = async () =>
      (
        (await h.client.sendRequest('textDocument/completion', {
          textDocument: { uri: hmlUri },
          position: { line: 0, character: 8 },
        })) as Array<{ label: string }>
      ).map((i) => i.label);
    expect(await labels()).toContain('fromDisk');
    h.client.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: jsUri,
        languageId: 'javascript',
        version: 1,
        text: 'export default { data: { fromBuffer: 1 } };',
      },
    });
    expect(await labels()).toEqual(expect.arrayContaining(['fromBuffer']));
    h.client.sendNotification('textDocument/didOpen', {
      textDocument: { uri: cssUri, languageId: 'css', version: 1, text: 'text { color: red; }' },
    });
    const d = await h.waitDiagnostics(cssUri);
    expect(d.map((x) => x.code)).toEqual(['css/unsupported-selector']);
    fs.rmSync(dir, { recursive: true, force: true });
    // non-file URIs and missing files are simply absent
    open(h, '<text>{{}}</text>', 'untitled:x.hml');
    await h.waitDiagnostics('untitled:x.hml');
    expect(
      await h.client.sendRequest('textDocument/completion', {
        textDocument: { uri: 'untitled:x.hml' },
        position: { line: 0, character: 8 },
      }),
    ).toEqual([expect.objectContaining({ label: '$t' })]);
  });

  it('cross-file: config.json and i18n edits re-validate open pages; disk listing and watched files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-prj-'));
    const main = path.join(root, 'entry', 'src', 'main');
    const js = path.join(main, 'js', 'default');
    fs.mkdirSync(path.join(js, 'pages', 'index'), { recursive: true });
    fs.mkdirSync(path.join(js, 'i18n'), { recursive: true });
    fs.writeFileSync(path.join(js, 'pages', 'index', 'index.hml'), '<div></div>');
    fs.writeFileSync(path.join(js, 'i18n', 'en-US.json'), '{ "a": "A" }');
    const cfgText = (pages: string) =>
      `{ "app": {}, "module": { "deviceType": ["smartVision"], "js": [{ "name": "default", "pages": [${pages}] }] } }`;
    fs.writeFileSync(path.join(main, 'config.json'), cfgText('"pages/index/index"'));
    const pageUri = pathToFileURL(path.join(js, 'pages', 'b', 'b.hml')).href;
    const cfgUri = pathToFileURL(path.join(main, 'config.json')).href;
    const zhUri = pathToFileURL(path.join(js, 'i18n', 'zh-CN.json')).href;
    const h = await start();
    open(h, "<div><text>{{ $t('a') }}{{ $t('b') }}</text></div>", pageUri);
    const codes = (d: Diagnostic[]) => d.map((x) => String(x.code));
    expect(codes(await h.waitDiagnostics(pageUri))).toEqual(['prj/page-not-registered', 'i18n/missing-key']);
    // open (unsaved, not on disk) i18n buffer joins the locale list
    h.client.sendNotification('textDocument/didOpen', {
      textDocument: { uri: zhUri, languageId: 'json', version: 1, text: '{ "a": "甲", "b": "乙" }' },
    });
    await h.waitDiagnostics(zhUri);
    // FR-LANG-008: $t('a') jumps to the key in every locale file (disk + open buffer)
    const defs = (await h.client.sendRequest('textDocument/definition', {
      textDocument: { uri: pageUri },
      position: { line: 0, character: 19 },
    })) as Array<{ uri: string; range: { start: { line: number; character: number } } }>;
    expect(defs.map((d) => [path.basename(fileURLToPath(d.uri)), d.range.start.character])).toEqual([
      ['en-US.json', 2],
      ['zh-CN.json', 2],
    ]);
    expect(
      await h.client.sendRequest('textDocument/definition', {
        textDocument: { uri: 'file:///nope.hml' },
        position: { line: 0, character: 0 },
      }),
    ).toEqual([]);
    h.client.sendNotification('textDocument/didOpen', {
      textDocument: { uri: cfgUri, languageId: 'json', version: 1, text: cfgText('"pages/index/index"') },
    });
    expect(codes(await h.waitDiagnostics(cfgUri))).toEqual([]);
    h.client.sendNotification('textDocument/didChange', {
      textDocument: { uri: cfgUri, version: 2 },
      contentChanges: [{ text: cfgText('"pages/index/index", "pages/b/b", "pages/c/c"') }],
    });
    expect(codes(await h.waitDiagnostics(cfgUri, 2))).toEqual(['prj/page-file-missing']);
    expect(codes(await h.waitDiagnostics(pageUri, 2))).toEqual(['i18n/missing-translation']);
    // the page file appears on disk: a watched-file event re-validates everything
    fs.mkdirSync(path.join(js, 'pages', 'c'));
    fs.writeFileSync(path.join(js, 'pages', 'c', 'c.hml'), '<div></div>');
    const cUri = pathToFileURL(path.join(js, 'pages', 'c', 'c.hml')).href;
    h.client.sendNotification('workspace/didChangeWatchedFiles', { changes: [{ uri: cUri, type: 1 }] });
    expect(codes(await h.waitDiagnostics(cfgUri, 3))).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('switches SDK via ohjs/sdkChanged and re-validates open documents', async () => {
    const h = await start({ sdkVersion: '5.0.3' });
    await h.waitStatus(1);
    open(h, '<div></div>');
    await h.waitDiagnostics(URI);
    h.client.sendNotification(SDK_CHANGED_NOTIFICATION, { version: '6.1-LTS' });
    const st = await h.waitStatus(2);
    expect(st).toMatchObject({
      version: '6.1-lts',
      ok: true,
      provisional: true,
      available: ['5.0.3', '6.1-lts'],
    });
    await h.waitDiagnostics(URI, 2);
    h.client.sendNotification(SDK_CHANGED_NOTIFICATION, { version: '1.0' });
    const bad = await h.waitStatus(3);
    expect(bad.ok).toBe(false);
    expect(bad.version).toBe('6.1-lts');
    expect(bad.error).toContain('no schema data pack');
  });

  it('reports a bad initial SDK version and falls back to the default', async () => {
    const h = await start({ sdkVersion: '0.1' });
    const st = await h.waitStatus(1);
    expect(st).toMatchObject({ ok: false, version: '5.0.3' });
  });

  it('applies rule settings from initializationOptions, didChangeConfiguration push and pull', async () => {
    const h = await start({ rules: { 'hml/unknown-component': 'off' } });
    open(h, '<foo></foo>');
    expect(await h.waitDiagnostics(URI)).toEqual([]);
    h.client.sendNotification('workspace/didChangeConfiguration', {
      settings: { ohjs: { lang: { rules: { 'hml/unknown-component': 'warning' } } } },
    });
    const d = await h.waitDiagnostics(URI, 2);
    expect(d[0]!.severity).toBe(2);
    h.client.sendNotification('workspace/didChangeConfiguration', { settings: {} });
    expect((await h.waitDiagnostics(URI, 3))[0]!.severity).toBe(1);

    const p = await start({ configuration: true });
    p.config = { rules: { 'hml/unknown-component': 'hint' } };
    open(p, '<foo></foo>');
    await p.waitDiagnostics(URI);
    p.client.sendNotification('workspace/didChangeConfiguration', { settings: null });
    expect((await p.waitDiagnostics(URI, 2))[0]!.severity).toBe(4);
    p.config = null as unknown as Record<string, unknown>;
    p.client.sendNotification('workspace/didChangeConfiguration', { settings: null });
    expect((await p.waitDiagnostics(URI, 3))[0]!.severity).toBe(1);
  });

  it('applies ohjs.diagnostics.transpilableSyntax from initializationOptions, push and pull', async () => {
    const JS = 'file:///w/entry/src/main/js/default/pages/index/index.js';
    const openJs = (h: Harness, text: string): void =>
      void h.client.sendNotification('textDocument/didOpen', {
        textDocument: { uri: JS, languageId: 'javascript', version: 1, text },
      });
    const sev = (l: Array<{ code?: unknown; severity?: number }>): unknown[] =>
      l.map((d) => [d.code, d.severity]);
    const h = await start({ transpilableSyntax: 'error' });
    openJs(h, 'var a = b?.c;\nfunction* g() {}');
    expect(sev(await h.waitDiagnostics(JS))).toEqual([
      ['js/es6-syntax', 1],
      ['js/es6-untranspilable', 1],
    ]);
    h.client.sendNotification('workspace/didChangeConfiguration', {
      settings: { ohjs: { diagnostics: { transpilableSyntax: 'off' } } },
    });
    expect(sev(await h.waitDiagnostics(JS, 2))).toEqual([['js/es6-untranspilable', 1]]);

    const p = await start({ configuration: true });
    p.diag = { transpilableSyntax: 'off' };
    openJs(p, 'var a = b?.c;');
    await p.waitDiagnostics(JS);
    p.client.sendNotification('workspace/didChangeConfiguration', { settings: null });
    expect(await p.waitDiagnostics(JS, 2)).toEqual([]);
  });

  it('debounces diagnostics while typing', async () => {
    const h = await start({ debounceMs: 30 });
    open(h, '<div></div>');
    await h.waitDiagnostics(URI);
    for (let v = 2; v <= 5; v++) {
      h.client.sendNotification('textDocument/didChange', {
        textDocument: { uri: URI, version: v },
        contentChanges: [{ text: `<foo${v}></foo${v}>` }],
      });
    }
    const d = await h.waitDiagnostics(URI, 2);
    expect(d[0]!.message).toContain('<foo5>');
    expect(h.diagnostics.get(URI)).toHaveLength(2);
    // a pending timer is cancelled by close
    h.client.sendNotification('textDocument/didChange', {
      textDocument: { uri: URI, version: 6 },
      contentChanges: [{ text: '<bar></bar>' }],
    });
    h.client.sendNotification('textDocument/didClose', { textDocument: { uri: URI } });
    expect(await h.waitDiagnostics(URI, 3)).toEqual([]);
    await new Promise((r) => setTimeout(r, 60));
    expect(h.diagnostics.get(URI)).toHaveLength(3);
    // shutdown with a pending timer
    open(h, '<div></div>', 'file:///other.hml');
    h.client.sendNotification('textDocument/didChange', {
      textDocument: { uri: 'file:///other.hml', version: 2 },
      contentChanges: [{ text: '<x></x>' }],
    });
  });
});
