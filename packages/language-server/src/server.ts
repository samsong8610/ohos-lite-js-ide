/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeResult,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  SDK_CHANGED_NOTIFICATION,
  SDK_STATUS_NOTIFICATION,
  SETTINGS_SECTION,
  type InitializationOptions,
  type SdkChangedParams,
  type SdkStatusParams,
} from './protocol';
import { DEFAULT_SDK_VERSION, SchemaRegistry } from './schema-registry';
import { documentKind, OhjsLanguageService } from './service';

export const SERVER_NAME = 'ohjs-language-server';

/**
 * Wires the language service to an LSP connection: incremental document sync, completion,
 * debounced diagnostics, SDK hot switch and rule settings.
 */
export function startServer(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  let service: OhjsLanguageService | undefined;
  let debounceMs = 200;
  let hasConfigurationCapability = false;
  const timers = new Map<string, NodeJS.Timeout>();

  /** open buffer first (unsaved edits), then disk; only file: URIs are read from disk */
  const readFile = (uri: string): string | undefined => {
    const open = documents.get(uri);
    if (open) return open.getText();
    if (!uri.startsWith('file:')) return undefined;
    try {
      return fs.readFileSync(fileURLToPath(uri), 'utf8');
    } catch {
      return undefined;
    }
  };
  /** disk entries plus open (possibly unsaved, never saved) buffers in that directory */
  const listDir = (dirUri: string): string[] | undefined => {
    const names = new Set<string>();
    let found = false;
    if (dirUri.startsWith('file:')) {
      try {
        for (const n of fs.readdirSync(fileURLToPath(dirUri))) names.add(n);
        found = true;
      } catch {
        // missing directory
      }
    }
    for (const d of documents.all()) {
      if (d.uri.startsWith(dirUri) && !d.uri.slice(dirUri.length).includes('/')) {
        names.add(decodeURIComponent(d.uri.slice(dirUri.length)));
        found = true;
      }
    }
    return found ? [...names] : undefined;
  };
  const validateNow = (doc: TextDocument): void => {
    if (!service) return;
    void connection.sendDiagnostics({
      uri: doc.uri,
      version: doc.version,
      diagnostics: service.validate(doc),
    });
  };
  const schedule = (doc: TextDocument): void => {
    const t = timers.get(doc.uri);
    if (t) clearTimeout(t);
    if (debounceMs <= 0) {
      validateNow(doc);
      return;
    }
    timers.set(
      doc.uri,
      setTimeout(() => {
        timers.delete(doc.uri);
        const current = documents.get(doc.uri);
        if (current) validateNow(current);
      }, debounceMs),
    );
  };
  const revalidateAll = (): void => {
    for (const d of documents.all()) validateNow(d);
  };
  /** config.json, i18n, page .js and .hml feed other documents' diagnostics (page registration, $t keys, page files) */
  let crossTimer: NodeJS.Timeout | undefined;
  const scheduleDependents = (changed: TextDocument): void => {
    const kind = documentKind(changed);
    if (kind !== 'config' && kind !== 'i18n' && kind !== 'hml') return;
    const run = (): void => {
      crossTimer = undefined;
      for (const d of documents.all()) {
        const k = documentKind(d);
        if (d.uri !== changed.uri && (k === 'hml' || k === 'config')) validateNow(d);
      }
    };
    if (crossTimer) clearTimeout(crossTimer);
    if (debounceMs <= 0) run();
    else crossTimer = setTimeout(run, debounceMs);
  };
  const status = (ok: boolean, error?: string): void => {
    if (!service) return;
    const params: SdkStatusParams = {
      version: service.sdkVersion,
      ok,
      provisional: service.registry.active.provisional,
      available: service.registry.versions(),
      ...(error ? { error } : {}),
    };
    void connection.sendNotification(SDK_STATUS_NOTIFICATION, params);
  };

  connection.onInitialize((params): InitializeResult => {
    const opts = (params.initializationOptions ?? {}) as InitializationOptions;
    hasConfigurationCapability = !!params.capabilities.workspace?.configuration;
    if (typeof opts.debounceMs === 'number') debounceMs = opts.debounceMs;
    const registry = new SchemaRegistry(opts.schemaDir, DEFAULT_SDK_VERSION);
    service = new OhjsLanguageService(
      registry,
      { ...(opts.rules ? { rules: opts.rules } : {}) },
      { read: readFile, list: listDir },
    );
    let startError: string | undefined;
    if (opts.sdkVersion) {
      try {
        service.setSdkVersion(opts.sdkVersion);
      } catch (e) {
        startError = (e as Error).message;
      }
    }
    connection.onInitialized(() => status(!startError, startError));
    return {
      capabilities: {
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental },
        completionProvider: {
          triggerCharacters: ['<', ' ', '/', '@', ':', '{', '"', "'"],
          resolveProvider: false,
        },
      },
      serverInfo: { name: SERVER_NAME, version: '0.1.0' },
    };
  });

  const pullSettings = async (): Promise<void> => {
    if (!hasConfigurationCapability || !service) return;
    const cfg = (await connection.workspace.getConfiguration(SETTINGS_SECTION)) as {
      rules?: Record<string, unknown>;
    } | null;
    service.settings = { ...(cfg?.rules ? { rules: cfg.rules } : {}) };
  };
  connection.onDidChangeConfiguration(async (change) => {
    if (!service) return;
    if (hasConfigurationCapability) await pullSettings();
    else {
      const s = (change.settings as { ohjs?: { lang?: { rules?: Record<string, unknown> } } } | undefined)
        ?.ohjs?.lang;
      service.settings = { ...(s?.rules ? { rules: s.rules } : {}) };
    }
    revalidateAll();
  });

  connection.onNotification(SDK_CHANGED_NOTIFICATION, (p: SdkChangedParams) => {
    if (!service) return;
    try {
      service.setSdkVersion(p.version);
      status(true);
      revalidateAll();
    } catch (e) {
      status(false, (e as Error).message);
    }
  });

  connection.onCompletion((p) => {
    const doc = documents.get(p.textDocument.uri);
    return doc && service ? service.complete(doc, p.position) : [];
  });

  // TextDocuments fires onDidChangeContent for didOpen as well: validate a fresh document immediately
  documents.onDidChangeContent((e) => {
    if (e.document.version <= 1 && !timers.has(e.document.uri)) validateNow(e.document);
    else {
      schedule(e.document);
      scheduleDependents(e.document);
    }
  });
  // files changed on disk (created/deleted pages, i18n files, config.json edited outside the editor)
  connection.onDidChangeWatchedFiles(() => revalidateAll());
  documents.onDidClose((e) => {
    const t = timers.get(e.document.uri);
    if (t) clearTimeout(t);
    timers.delete(e.document.uri);
    service?.forget(e.document.uri);
    void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  });
  connection.onShutdown(() => {
    for (const t of timers.values()) clearTimeout(t);
    if (crossTimer) clearTimeout(crossTimer);
    timers.clear();
  });

  documents.listen(connection);
  connection.listen();
}
