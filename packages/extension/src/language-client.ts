/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';
import {
  SDK_CHANGED_NOTIFICATION,
  SDK_STATUS_NOTIFICATION,
  type InitializationOptions,
  type SdkStatusParams,
} from '@ohjs/language-server/out/protocol';
import { languageDocumentSelector, sdkStatusText } from './language-settings';

export interface LanguageClientHandle {
  client: LanguageClient;
  /** resolves with the first ohjs/sdkStatus after start-up */
  firstStatus: Promise<SdkStatusParams>;
}

/**
 * Starts the language server as a separate Node process over IPC (ARCHITECTURE §2.2, FR-LANG-012) and
 * forwards SDK switches (`ohjs.sdkVersion`) as `ohjs/sdkChanged` (§16.2).
 */
export async function startLanguageClient(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): Promise<LanguageClientHandle> {
  const module = context.asAbsolutePath('dist/server.js');
  const serverOptions: ServerOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6019'] } },
  };
  const cfg = vscode.workspace.getConfiguration('ohjs');
  const initializationOptions: InitializationOptions = {
    sdkVersion: cfg.get<string>('sdkVersion', '5.0.3'),
    schemaDir: context.asAbsolutePath('dist/schemas/components'),
    rules: cfg.get<Record<string, unknown>>('lang.rules', {}),
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: languageDocumentSelector(),
    initializationOptions,
    outputChannel: output,
    synchronize: { configurationSection: 'ohjs' },
  };
  const client = new LanguageClient(
    'ohjs',
    'OpenHarmony Lite JS Language Server',
    serverOptions,
    clientOptions,
  );

  const status = vscode.window.createStatusBarItem('ohjs.sdk', vscode.StatusBarAlignment.Right, 100);
  status.name = 'OHJS SDK';
  context.subscriptions.push(status);
  let resolveFirst!: (p: SdkStatusParams) => void;
  const firstStatus = new Promise<SdkStatusParams>((r) => (resolveFirst = r));
  client.onNotification(SDK_STATUS_NOTIFICATION, (p: SdkStatusParams) => {
    status.text = sdkStatusText(p);
    status.tooltip = p.error ?? `available: ${p.available.join(', ')}`;
    status.show();
    if (p.ok) output.info(`language server: SDK ${p.version}${p.provisional ? ' (provisional schema)' : ''}`);
    else output.error(`language server: ${p.error ?? 'SDK switch failed'}`);
    resolveFirst(p);
  });
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ohjs.sdkVersion')) {
        const version = vscode.workspace.getConfiguration('ohjs').get<string>('sdkVersion', '5.0.3');
        void client.sendNotification(SDK_CHANGED_NOTIFICATION, { version });
      }
    }),
  );
  context.subscriptions.push({ dispose: () => void client.stop() });
  await client.start();
  return { client, firstStatus };
}
