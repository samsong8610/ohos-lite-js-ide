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
  sdkTooltip,
  type SdkVersionChoice,
} from './language-settings';
import { loadSystemModules } from '@ohjs/schemas';
import { writeWorkspaceTypes, type JsconfigOutcome, type TypesIo } from './workspace-types';

const NEVER_MERGE_KEY = 'ohjs.jsconfig.neverMerge';

/** Root of the Lite project: the workspace folder holding .ohjs/project.json, else the first one. */
async function projectRoot(): Promise<vscode.Uri | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const f of folders) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(f.uri, '.ohjs', 'project.json'));
      return f.uri;
    } catch {
      // not this one
    }
  }
  return folders[0]?.uri;
}

/** Regenerates `.ohjs/` types for `version` (ARCHITECTURE §7.1); failures are logged, never thrown. */
export async function syncWorkspaceTypes(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  version: string,
): Promise<JsconfigOutcome | undefined> {
  const root = await projectRoot();
  if (!root) return undefined;
  const uri = (rel: string): vscode.Uri => vscode.Uri.joinPath(root, ...rel.split('/'));
  const io: TypesIo = {
    read: async (rel) => {
      try {
        return new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri(rel)));
      } catch {
        return undefined;
      }
    },
    write: (rel, content) =>
      Promise.resolve(vscode.workspace.fs.writeFile(uri(rel), new TextEncoder().encode(content))),
    askMerge: async (changes) => {
      const merge = vscode.l10n.t('Merge');
      const never = vscode.l10n.t('Never');
      const pick = await vscode.window.showInformationMessage(
        vscode.l10n.t(
          'OHJS wants to make jsconfig.json extend the generated ES5 config and @system.* types ({0}). Comments in the file are not kept.',
          changes.join('; '),
        ),
        merge,
        vscode.l10n.t('Not now'),
        never,
      );
      return pick === merge ? 'merge' : pick === never ? 'never' : 'later';
    },
    neverMerge: context.workspaceState.get<boolean>(NEVER_MERGE_KEY, false),
    setNeverMerge: () => Promise.resolve(context.workspaceState.update(NEVER_MERGE_KEY, true)),
    log: (m) => output.info(m),
  };
  try {
    const pack = loadSystemModules(version, context.asAbsolutePath('dist/schemas/components'));
    const outcome = await writeWorkspaceTypes(io, pack);
    output.info(`jsconfig: .ohjs types for SDK ${version} (${outcome})`);
    return outcome;
  } catch (e) {
    output.error(`jsconfig: generating .ohjs types failed: ${(e as Error).message}`);
    return undefined;
  }
}

export interface LanguageClientHandle {
  client: LanguageClient;
  /** where the SDK version came from at start-up */
  sdk: SdkVersionChoice;
  /** resolves with the first ohjs/sdkStatus after start-up */
  firstStatus: Promise<SdkStatusParams>;
  /** resolves once `.ohjs/` types were generated for the start-up SDK */
  typesReady: Promise<JsconfigOutcome | undefined>;
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
  let choice = sdk;
  const settingValue = (): string =>
    vscode.workspace.getConfiguration('ohjs').get<string>('sdkVersion', '5.0.3');
  let lastStatus: SdkStatusParams | undefined;
  output.info(
    `language server: SDK ${sdk.version} from ${sdk.source === 'project' ? '.ohjs/project.json' : 'ohjs.sdkVersion setting'}`,
  );
  const initializationOptions: InitializationOptions = {
    sdkVersion: sdk.version,
    schemaDir: context.asAbsolutePath('dist/schemas/components'),
    rules: cfg.get<Record<string, unknown>>('lang.rules', {}),
    transpilableSyntax: cfg.get<string>('diagnostics.transpilableSyntax', 'warning'),
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: languageDocumentSelector(),
    initializationOptions,
    outputChannel: output,
    synchronize: {
      configurationSection: 'ohjs',
      // config.json, i18n files, pages created/deleted outside the editor feed cross-file diagnostics
      fileEvents: vscode.workspace.createFileSystemWatcher('**/src/main/**/*.{json,hml,js}'),
    },
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
  let typesVersion: string | undefined;
  let resolveTypes!: (p: Promise<JsconfigOutcome | undefined>) => void;
  const typesReady = new Promise<JsconfigOutcome | undefined>((r) => (resolveTypes = r));
  void firstStatus.then((p) => {
    if (!p.ok) resolveTypes(Promise.resolve(undefined));
  });
  client.onNotification(SDK_STATUS_NOTIFICATION, (p: SdkStatusParams) => {
    status.text = sdkStatusText(p);
    lastStatus = p;
    status.tooltip = sdkTooltip(p, choice, settingValue(), vscode.l10n.t);
    status.show();
    if (p.ok) output.info(`language server: SDK ${p.version}${p.provisional ? ' (provisional schema)' : ''}`);
    else output.error(`language server: ${p.error ?? 'SDK switch failed'}`);
    if (p.ok && p.version !== typesVersion) {
      typesVersion = p.version;
      const done = syncWorkspaceTypes(context, output, p.version);
      resolveTypes(done);
    }
    resolveFirst(p);
  });
  let lastVersion = sdk.version;
  const resync = async (): Promise<void> => {
    const next = await currentSdk();
    choice = next;
    if (lastStatus) status.tooltip = sdkTooltip(lastStatus, choice, settingValue(), vscode.l10n.t);
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
  return { client, sdk, firstStatus, typesReady };
}
