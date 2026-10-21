/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import {
  DeviceProfileRegistry,
  NodeProcessRunner,
  ToolLocator,
  createHostPlatform,
  type DeviceInfo,
  type DeviceProfile,
  type OutputEncoding,
} from '@ohjs/core';
import { HdcTransport } from '@ohjs/transport-hdc';
import { DEFAULT_PROFILE_ID, builtinProfilesDir, loadProfilesFromDir } from './device-profiles';
import { startLanguageClient } from './language-client';
import { detectFromConfigJson } from './project-detector';

export interface OhjsExtensionApi {
  readonly isProject: boolean;
  readonly reason: string;
  readonly deviceProfile?: DeviceProfile;
  /** first ohjs/sdkStatus from the language server (undefined when it failed to start) */
  readonly languageServer?: Promise<{ version: string; ok: boolean }>;
}

/** `ohjs.device.refresh`: lists hdc targets into the OHJS output channel (FR-DEP-001 groundwork). */
function registerDeviceCommands(context: vscode.ExtensionContext, output: vscode.LogOutputChannel): void {
  const platform = createHostPlatform();
  const encoding = vscode.workspace
    .getConfiguration('ohjs.advanced')
    .get<OutputEncoding>('outputEncoding', 'auto');
  const runner = new NodeProcessRunner(platform, { encoding });
  context.subscriptions.push({ dispose: () => void runner.disposeAll() });
  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.device.refresh', async (): Promise<DeviceInfo[]> => {
      const user = vscode.workspace.getConfiguration('ohjs.tools').get<string>('hdcPath') || undefined;
      try {
        const hdc = new ToolLocator(platform).locate('hdc', { user, extensionDir: context.extensionPath });
        const targets = await new HdcTransport({ hdcPath: hdc.path, runner }).listTargets();
        output.info(`hdc (${hdc.source}) ${hdc.path}: ${targets.length} target(s)`);
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
  const output = vscode.window.createOutputChannel('OHJS', { log: true });
  context.subscriptions.push(output);

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
  if (!result.isProject) return result;
  registerDeviceCommands(context, output);

  let languageServer: OhjsExtensionApi['languageServer'];
  try {
    languageServer = (await startLanguageClient(context, output)).firstStatus;
  } catch (e) {
    output.error(`language server failed to start: ${(e as Error).message}`);
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
  return { ...result, deviceProfile, ...(languageServer ? { languageServer } : {}) };
}

export function deactivate(): void {
  // child processes are owned by IProcessRunner instances registered in context.subscriptions
}
