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
import {
  languageDocumentSelector,
  resolveSdkVersion,
  sdkStatusText,
  type SdkVersionChoice,
} from './language-settings';

export interface LanguageClientHandle {
  client: LanguageClient;
  /** where the SDK version came from at start-up */
  sdk: SdkVersionChoice;
  /** resolves with the first ohjs/sdkStatus after start-up */
  firstStatus: Promise<SdkStatusParams>;
}

async function readProjectJson(): Promise<string | undefined> {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder.uri, '.ohjs', 'project.json'),
      );
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      // absent in this folder
    }
  }
  return undefined;
}

async function currentSdk(): Promise<SdkVersionChoice> {
  const setting = vscode.workspace.getConfiguration('ohjs').get<string>('sdkVersion', '5.0.3');
  return resolveSdkVersion(await readProjectJson(), setting);
}

/**
 * Loaded lazily from dist/client.js (its own bundle) so the activation bundle stays small.
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
  const sdk = await currentSdk();
  output.info(
    `language server: SDK ${sdk.version} from ${sdk.source === 'project' ? '.ohjs/project.json' : 'ohjs.sdkVersion setting'}`,
  );
  const initializationOptions: InitializationOptions = {
    sdkVersion: sdk.version,
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
  let lastVersion = sdk.version;
  const resync = async (): Promise<void> => {
    const next = await currentSdk();
    if (next.version === lastVersion) return;
    lastVersion = next.version;
    output.info(`language server: SDK -> ${next.version} (${next.source})`);
    await client.sendNotification(SDK_CHANGED_NOTIFICATION, { version: next.version });
  };
  const watcher = vscode.workspace.createFileSystemWatcher('**/.ohjs/project.json');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => void resync()),
    watcher.onDidChange(() => void resync()),
    watcher.onDidDelete(() => void resync()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ohjs.sdkVersion')) void resync();
    }),
  );
  context.subscriptions.push({ dispose: () => void client.stop() });
  await client.start();
  return { client, sdk, firstStatus };
}
