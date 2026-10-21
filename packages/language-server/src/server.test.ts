/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
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
  client.onRequest('workspace/configuration', () => [h.config]);
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
