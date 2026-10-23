/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import {
  DeviceProfileRegistry,
  NodeProcessRunner,
  createHostPlatform,
  type DeviceInfo,
  type DeviceProfile,
  type OutputEncoding,
} from '@ohjs/core';
import { HdcToolchainResolver, HdcTransport } from '@ohjs/transport-hdc';
import { DEFAULT_PROFILE_ID, builtinProfilesDir, loadProfilesFromDir } from './device-profiles';
import { buildHdcToolchainContext } from './hdc-context';
import { registerDeployCommands } from './deploy-commands';
import { registerOhjsDebug } from './debug/register';
// type-only: the client (vscode-languageclient, ~440 KB) lives in dist/client.js and is required on demand
import type * as LanguageClientModule from './language-client';
import { detectFromConfigJson } from './project-detector';
import { registerProjectWizard } from './project-wizard/register';

export interface OhjsExtensionApi {
  readonly isProject: boolean;
  readonly reason: string;
  readonly deviceProfile?: DeviceProfile;
  /** first ohjs/sdkStatus from the language server (undefined when it failed to start) */
  readonly languageServer?: Promise<{ version: string; ok: boolean }>;
  /** outcome of generating `.ohjs/` jsconfig + d.ts for the start-up SDK (FR-LANG-007) */
  readonly jsTypes?: Promise<string | undefined>;
  /** wall-clock time spent in activate(), ms (NFR-PERF-001) */
  readonly activationMs: number;
}

/** Starts the language client from its separate bundle without blocking activation. */
function startLanguageServer(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): { status: Promise<{ version: string; ok: boolean }>; types: Promise<string | undefined> } {
  const started = performance.now();
  // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-require-imports -- runtime require of the separate client bundle (lazy load)
  const mod = require(context.asAbsolutePath('dist/client.js')) as typeof LanguageClientModule;
  const handle = mod.startLanguageClient(context, output);
  return {
    status: handle.then((h) => {
      output.info(`language client ready in ${Math.round(performance.now() - started)} ms`);
      return h.firstStatus;
    }),
    types: handle.then((h) => h.typesReady),
  };
}

/** `ohjs.device.refresh`: lists hdc targets into the OHJS output channel (FR-DEP-001 groundwork). */
function registerDeviceCommands(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  firmwareManifestPath?: string,
): void {
  const platform = createHostPlatform();
  const encoding = vscode.workspace
    .getConfiguration('ohjs.advanced')
    .get<OutputEncoding>('outputEncoding', 'auto');
  const runner = new NodeProcessRunner(platform, { encoding });
  const resolver = new HdcToolchainResolver(platform);
  context.subscriptions.push({ dispose: () => void runner.disposeAll() });
  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.device.refresh', async (): Promise<DeviceInfo[]> => {
      try {
        const ctx = await buildHdcToolchainContext(context, runner, firmwareManifestPath);
        const bootstrap = resolver.locate(ctx);
        const bootstrapTransport = new HdcTransport({ hdcPath: bootstrap.path, runner });
        const targets = await bootstrapTransport.listTargets();
        const resolved = await resolver.resolve(ctx, targets);
        const { located: hdc, ohToolchain, deviceOhVersion } = resolved;
        const versionNote =
          deviceOhVersion != null
            ? `device OH ${deviceOhVersion}${ohToolchain ? ` → toolchain ${ohToolchain}` : ''}`
            : ohToolchain
              ? `toolchain ${ohToolchain}`
              : '';
        output.info(
          `hdc (${hdc.source}) ${hdc.path}${versionNote ? ` [${versionNote}]` : ''}: ${targets.length} target(s)`,
        );
        for (const t of targets) output.info(`  ${t.key} ${t.connType} ${t.state} ${t.name ?? ''}`);
        return targets;
      } catch (e) {
        output.error(`device refresh failed: ${(e as Error).message}`);
        void vscode.window.showErrorMessage((e as Error).message);
        return [];
      }
    }),
  );
}

/**
 * Activation must stay cheap (NFR-PERF-001 ≤ 500 ms): only the precise project check runs here,
 * everything else is lazily created after the check passes (ARCHITECTURE §4).
 */
export async function activate(context: vscode.ExtensionContext): Promise<OhjsExtensionApi> {
  const t0 = performance.now();
  const output = vscode.window.createOutputChannel('OHJS', { log: true });
  context.subscriptions.push(output);
  registerProjectWizard(context);

  const files = await vscode.workspace.findFiles('**/src/main/config.json', '**/node_modules/**', 20);
  let result = { isProject: false, reason: 'no src/main/config.json found' };
  for (const uri of files) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const r = detectFromConfigJson(new TextDecoder('utf-8').decode(bytes));
    result = r;
    if (r.isProject) break;
  }
  await vscode.commands.executeCommand('setContext', 'ohjs.isProject', result.isProject);
  output.info(`project detection: ${result.isProject} (${result.reason})`);
  if (!result.isProject) return { ...result, activationMs: performance.now() - t0 };

  let languageServer: OhjsExtensionApi['languageServer'];
  let jsTypes: OhjsExtensionApi['jsTypes'];
  try {
    const ls = startLanguageServer(context, output);
    languageServer = ls.status;
    jsTypes = ls.types;
    jsTypes.catch(() => undefined);
    languageServer.catch((e: Error) => output.error(`language server failed to start: ${e.message}`));
  } catch (e) {
    output.error(`language client failed to load: ${(e as Error).message}`);
  }

  let deviceProfile: DeviceProfile | undefined;
  try {
    const registry = new DeviceProfileRegistry();
    loadProfilesFromDir(registry, builtinProfilesDir(context.extensionPath), 'builtin');
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      loadProfilesFromDir(
        registry,
        vscode.Uri.joinPath(folder.uri, '.ohjs', 'device-profiles').fsPath,
        'project',
      );
    }
    const cfg = vscode.workspace.getConfiguration('ohjs.device');
    const display = cfg.get<{ width?: number; height?: number }>('display');
    deviceProfile = registry.resolve(cfg.get<string>('profile') || DEFAULT_PROFILE_ID, {
      ...cfg.get<object>('profileOverrides', {}),
      ...(display ? { display } : {}),
    });
    output.info(
      `device profile: ${deviceProfile.id} ${deviceProfile.display.width}x${deviceProfile.display.height}`,
    );
  } catch (e) {
    output.error(`device profile error: ${(e as Error).message}`);
  }
  registerDeviceCommands(context, output, deviceProfile?.paths.firmwareManifest);
  registerDeployCommands(context, output);
  registerOhjsDebug(context);
  const activationMs = performance.now() - t0;
  output.info(`activated in ${Math.round(activationMs)} ms`);
  return {
    ...result,
    deviceProfile,
    activationMs,
    ...(languageServer ? { languageServer } : {}),
    ...(jsTypes ? { jsTypes } : {}),
  };
}

export function deactivate(): void {
  // child processes are owned by IProcessRunner instances registered in context.subscriptions
}
