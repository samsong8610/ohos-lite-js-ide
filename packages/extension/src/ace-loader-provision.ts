/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import {
  ACE_LOADER_PROVISION_PIN,
  aceLoaderProvisionRoot,
  hasManualAceLoaderSource,
  isProvisionedAceLoaderReady,
  provisionAceLoader,
  resolveAceLoaderInstall,
} from '@ohjs/build';
import { NodeProcessRunner, createHostPlatform } from '@ohjs/core';

export function aceLoaderGlobalStorageRoot(context: vscode.ExtensionContext): string {
  return context.globalStorageUri.fsPath;
}

export function shouldAutoProvisionAceLoader(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): boolean {
  const buildCfg = vscode.workspace.getConfiguration('ohjs.build');
  const backend = buildCfg.get<'auto' | 'fixture' | 'ace-loader'>('backend', 'auto');
  if (backend !== 'auto' && backend !== 'ace-loader') return false;

  const aceLoaderPath = buildCfg.get<string>('aceLoaderPath', '').trim() || undefined;
  if (
    hasManualAceLoaderSource({ workspaceRoot, aceLoaderPath }) ||
    resolveAceLoaderInstall({ workspaceRoot, aceLoaderPath })
  ) {
    return false;
  }

  const storageRoot = aceLoaderGlobalStorageRoot(context);
  const autoRoot = aceLoaderProvisionRoot(storageRoot);
  return !isProvisionedAceLoaderReady(autoRoot);
}

/** Non-blocking prefetch after activation (first build still awaits if this is in flight). */
export function startAceLoaderPrefetch(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  workspaceRoot: string,
): void {
  if (!shouldAutoProvisionAceLoader(context, workspaceRoot)) return;

  const runner = new NodeProcessRunner(createHostPlatform());
  context.subscriptions.push({ dispose: () => void runner.disposeAll() });

  const storageRoot = aceLoaderGlobalStorageRoot(context);
  void vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'OHJS: preparing ace-loader',
      cancellable: false,
    },
    async () => {
      try {
        await provisionAceLoader(createHostPlatform(), runner, storageRoot, (msg) => output.info(msg));
        output.info(
          `ace-loader auto-provision: ${ACE_LOADER_PROVISION_PIN.tag} @ ${aceLoaderProvisionRoot(storageRoot)}`,
        );
      } catch (e) {
        output.warn(`ace-loader prefetch failed: ${(e as Error).message}`);
      }
    },
  );
}
