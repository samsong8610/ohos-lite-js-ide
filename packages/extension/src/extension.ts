/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { DeviceProfileRegistry, type DeviceProfile } from '@ohjs/core';
import { DEFAULT_PROFILE_ID, builtinProfilesDir, loadProfilesFromDir } from './device-profiles';
import { detectFromConfigJson } from './project-detector';

export interface OhjsExtensionApi {
  readonly isProject: boolean;
  readonly reason: string;
  readonly deviceProfile?: DeviceProfile;
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
  return { ...result, deviceProfile };
}

export function deactivate(): void {
  // child processes are owned by IProcessRunner instances registered in context.subscriptions
}
