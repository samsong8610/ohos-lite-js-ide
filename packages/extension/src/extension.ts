/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CUSTOM_PROFILE_ID,
  DeviceProfileRegistry,
  NodeProcessRunner,
  createHostPlatform,
  customProfileJson,
  isOhjsError,
  mergeProjectDeviceTarget,
  type DeviceInfo,
  type DeviceProfile,
  type DisplaySize,
  type OutputEncoding,
} from '@ohjs/core';
import { formatOhjsHostError } from './deploy-host-ux';
import { HdcToolchainResolver, HdcTransport } from '@ohjs/transport-hdc';
import {
  DEFAULT_PROFILE_ID,
  activeProfileId,
  builtinProfilesDir,
  loadProfilesFromDir,
  projectProfilesDir,
  resolveProfiles,
} from './device-profiles';
import { pickDeviceTarget, promptDisplaySize } from './device-target';
import { buildHdcToolchainContext } from './hdc-context';
import { startAceLoaderPrefetch } from './ace-loader-provision';
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
      output.show(true);
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
        const { log, toast } = formatOhjsHostError(e);
        output.error(isOhjsError(e) ? log : `device refresh failed: ${log}`);
        void vscode.window.showErrorMessage(toast);
        return [];
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.device.setTarget', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        void vscode.window.showErrorMessage('Open an OHJS project folder first.');
        return;
      }
      try {
        const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
        const registry = new DeviceProfileRegistry();
        loadProfilesFromDir(registry, builtinProfilesDir(context.extensionPath), 'builtin');
        for (const folder of folders) loadProfilesFromDir(registry, projectProfilesDir(folder), 'project');
        const builtins = resolveProfiles(registry).filter((p) => p.id !== CUSTOM_PROFILE_ID);
        const base = builtins.find((p) => p.id === DEFAULT_PROFILE_ID) ?? builtins[0];
        if (!base) throw new Error('No built-in device profiles are packaged.');

        const choice = await pickDeviceTarget(builtins, base);
        if (!choice) return;
        let size: DisplaySize | undefined;
        if (choice.kind === 'custom') {
          size = await promptDisplaySize({ width: base.display.width, height: base.display.height });
          if (!size) return;
        }

        const profileId = size ? CUSTOM_PROFILE_ID : choice.profile.id;
        const ohjsDir = path.join(root, '.ohjs');
        if (size) {
          fs.mkdirSync(path.join(ohjsDir, 'device-profiles'), { recursive: true });
          fs.writeFileSync(
            path.join(ohjsDir, 'device-profiles', `${CUSTOM_PROFILE_ID}.json`),
            customProfileJson(base.id, size),
          );
        }
        const projectFile = path.join(ohjsDir, 'project.json');
        const raw = fs.existsSync(projectFile) ? fs.readFileSync(projectFile, 'utf8') : undefined;
        fs.mkdirSync(ohjsDir, { recursive: true });
        fs.writeFileSync(projectFile, mergeProjectDeviceTarget(raw, profileId));

        const display = size ?? choice.profile.display;
        const label = `${profileId} ${display.width}×${display.height}`;
        output.info(`device target: ${label}`);
        void vscode.window.showInformationMessage(`OHJS: target device set to ${label}`);
      } catch (e) {
        const { log, toast } = formatOhjsHostError(e);
        output.error(log);
        void vscode.window.showErrorMessage(toast);
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
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    for (const folder of folders) {
      loadProfilesFromDir(registry, projectProfilesDir(folder), 'project');
    }
    const cfg = vscode.workspace.getConfiguration('ohjs.device');
    const display = cfg.get<{ width?: number; height?: number }>('display');
    deviceProfile = registry.resolve(
      activeProfileId(folders, cfg.get<string>('profile') ?? '', DEFAULT_PROFILE_ID),
      {
        ...cfg.get<object>('profileOverrides', {}),
        ...(display ? { display } : {}),
      },
    );
    output.info(
      `device profile: ${deviceProfile.id} ${deviceProfile.display.width}x${deviceProfile.display.height}`,
    );
  } catch (e) {
    output.error(`device profile error: ${(e as Error).message}`);
  }
  registerDeviceCommands(context, output, deviceProfile?.paths.firmwareManifest);
  registerDeployCommands(context, output);
  registerOhjsDebug(context);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) startAceLoaderPrefetch(context, output, workspaceRoot);
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
