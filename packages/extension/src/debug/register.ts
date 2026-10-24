/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { createHostPlatform, NodeProcessRunner, type OutputEncoding } from '@ohjs/core';
import { HdcToolchainResolver, HdcTransport } from '@ohjs/transport-hdc';
import { buildHdcToolchainContext } from '../hdc-context';
import {
  createWorkspaceSession,
  getLastBuild,
  readModuleInfo,
  resolveDeviceTarget,
  runBuild,
} from '../workspace-session';

export function registerOhjsDebug(context: vscode.ExtensionContext): void {
  const provider = new OhjsDebugConfigurationProvider(context);
  context.subscriptions.push({ dispose: () => provider.dispose() });
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'ohjs',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Initial,
    ),
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'ohjs',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Dynamic,
    ),
  );
}

class OhjsDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private runner: NodeProcessRunner | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private getRunner(): NodeProcessRunner {
    if (!this.runner) {
      const encoding = vscode.workspace
        .getConfiguration('ohjs.advanced')
        .get<OutputEncoding>('outputEncoding', 'auto');
      this.runner = new NodeProcessRunner(createHostPlatform(), { encoding });
    }
    return this.runner;
  }

  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): Promise<vscode.DebugConfiguration> {
    const cfg = { ...config };
    if (!cfg.type) cfg.type = 'ohjs';
    if (!cfg.request) cfg.request = 'launch';
    if (!cfg.name) cfg.name = 'Debug OHJS App';
    if (cfg.localPort == null) cfg.localPort = 19001;
    if (cfg.stopOnEntry == null) cfg.stopOnEntry = true;
    if (cfg.preDeploy == null) cfg.preDeploy = true;

    const runner = this.getRunner();
    const session = await createWorkspaceSession(this.context, runner);
    const mod = await readModuleInfo(session);
    if (!cfg.bundle) cfg.bundle = mod.bundleName;
    if (!cfg.ability) cfg.ability = mod.abilityName;

    const ctx = await buildHdcToolchainContext(this.context, runner, session.profile.paths.firmwareManifest);
    const resolver = new HdcToolchainResolver(createHostPlatform());
    const bootstrap = resolver.locate(ctx);
    const bootstrapTransport = new HdcTransport({ hdcPath: bootstrap.path, runner });
    const output = vscode.window.createOutputChannel('OHJS', { log: true });
    cfg.target = await resolveDeviceTarget(output, bootstrapTransport);
    cfg.hdcPath = bootstrap.path;

    const server = vscode.workspace.getConfiguration('ohjs.tools').get<string>('hdcServer', '').trim();
    if (server) cfg.hdcServer = server;

    cfg.deviceProfile = session.profile;
    cfg.workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (cfg.preDeploy) {
      let build = getLastBuild();
      if (!build) {
        await runBuild(this.context, output, session);
        build = getLastBuild();
      }
      if (build?.hapPath) cfg.hapPath = build.hapPath;
    }

    return cfg;
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): Promise<vscode.DebugConfiguration> {
    return this.resolveDebugConfiguration(folder, config);
  }

  dispose(): void {
    void this.runner?.disposeAll();
    this.runner = undefined;
  }
}
