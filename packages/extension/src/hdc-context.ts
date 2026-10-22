/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { parseProjectToolchainJson, type ProjectToolchainFile } from '@ohjs/core';
import type { HdcToolchainContext } from '@ohjs/transport-hdc';
import { resolveSdkVersion } from './language-settings';

export async function readProjectToolchain(): Promise<ProjectToolchainFile | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const uri = folder ? vscode.Uri.joinPath(folder.uri, '.ohjs', 'toolchain.json') : undefined;
  if (!uri) return undefined;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return parseProjectToolchainJson(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return undefined;
  }
}

export async function readProjectJsonRaw(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(folder.uri, '.ohjs', 'project.json'),
    );
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return undefined;
  }
}

/** Builds resolver input from workspace settings and optional device profile manifest path. */
export async function buildHdcToolchainContext(
  context: vscode.ExtensionContext,
  runner: HdcToolchainContext['runner'],
  firmwareManifestPath?: string,
): Promise<HdcToolchainContext> {
  const tools = vscode.workspace.getConfiguration('ohjs.tools');
  const sdkSetting = vscode.workspace.getConfiguration('ohjs').get<string>('sdkVersion', '5.0.3');
  const projectJson = await readProjectJsonRaw();
  const { version: fallbackOhVersion } = resolveSdkVersion(projectJson, sdkSetting);
  return {
    userHdcPath: tools.get<string>('hdcPath') || undefined,
    ohVersionOverride: tools.get<string>('hdcOhVersion') || undefined,
    fallbackOhVersion,
    projectToolchain: await readProjectToolchain(),
    extensionDir: context.extensionPath,
    firmwareManifestPath,
    runner,
  };
}
