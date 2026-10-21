/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { detectFromConfigJson } from './project-detector';

export interface OhjsExtensionApi {
  readonly isProject: boolean;
  readonly reason: string;
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
  return result;
}

export function deactivate(): void {
  // child processes are owned by IProcessRunner instances registered in context.subscriptions
}
