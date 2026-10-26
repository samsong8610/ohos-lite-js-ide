/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import {
  DeviceProfileRegistry,
  OhjsError,
  createHostPlatform,
  type DeviceProfile,
  type NodeProcessRunner,
} from '@ohjs/core';
import { buildProject, parseFaConfigJson, type BuildResult, type FaModuleInfo } from '@ohjs/build';
import { HdcToolchainResolver, HdcTransport, LiteDeployService } from '@ohjs/transport-hdc';
import { DEFAULT_PROFILE_ID, builtinProfilesDir, loadProfilesFromDir } from './device-profiles';
import { buildHdcToolchainContext } from './hdc-context';
import { depNoTargetHint } from './deploy-host-ux';

export interface WorkspaceSession {
  profile: DeviceProfile;
  transport: HdcTransport;
  deploy: LiteDeployService;
  runner: NodeProcessRunner;
  lastBuild?: BuildResult;
  moduleInfo?: FaModuleInfo;
}

function mergeProcessEnv(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null) out[k] = v;
  }
  if (extra) Object.assign(out, extra);
  return out;
}

let lastBuild: BuildResult | undefined;
let logTail: { kill: () => Promise<void> } | undefined;

export function getLastBuild(): BuildResult | undefined {
  return lastBuild;
}

export function clearLastBuild(): void {
  lastBuild = undefined;
}

export async function resolveDeviceTarget(
  output: vscode.LogOutputChannel,
  transport: HdcTransport,
): Promise<string> {
  const configured = vscode.workspace.getConfiguration('ohjs.device').get<string>('targetKey', '').trim();
  const targets = await transport.listTargets();
  const connected = targets.filter((t) => t.state === 'Connected' || t.state === 'Ready');
  if (configured) {
    const hit = connected.find((t) => t.key === configured);
    if (!hit) {
      throw new OhjsError('DEP-NO-TARGET', `Configured target "${configured}" is not connected`, {
        hint: depNoTargetHint(configured),
      });
    }
    return configured;
  }
  if (connected.length === 1) return connected[0]!.key;
  if (connected.length === 0) {
    throw new OhjsError('DEP-NO-TARGET', 'No connected hdc target (Refresh Devices first)', {
      hint: depNoTargetHint(),
    });
  }
  const pick = await vscode.window.showQuickPick(
    connected.map((t) => ({ label: t.key, description: t.connType, target: t })),
    { title: 'Select OHJS device' },
  );
  if (!pick) throw new OhjsError('DEP-NO-TARGET', 'No device selected');
  return pick.label;
}

function hdcGlobalArgs(): string[] {
  const server = vscode.workspace.getConfiguration('ohjs.tools').get<string>('hdcServer', '').trim();
  if (!server) {
    const port = process.env.OHOS_HDC_SERVER_PORT;
    if (port) return ['-s', `127.0.0.1:${port}`];
    return [];
  }
  return server.includes(':') ? ['-s', server] : ['-s', `127.0.0.1:${server}`];
}

function loadDeviceProfile(context: vscode.ExtensionContext): DeviceProfile {
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
  return registry.resolve(cfg.get<string>('profile') || DEFAULT_PROFILE_ID, {
    ...cfg.get<object>('profileOverrides', {}),
    ...(display ? { display } : {}),
  });
}

export async function createWorkspaceSession(
  context: vscode.ExtensionContext,
  runner: NodeProcessRunner,
): Promise<WorkspaceSession> {
  const platform = createHostPlatform();
  const profile = loadDeviceProfile(context);
  const ctx = await buildHdcToolchainContext(context, runner, profile.paths.firmwareManifest);
  const resolver = new HdcToolchainResolver(platform);
  const bootstrap = resolver.locate(ctx);
  const bootstrapTransport = new HdcTransport({
    hdcPath: bootstrap.path,
    runner,
    globalArgs: hdcGlobalArgs(),
    env: mergeProcessEnv(ctx.env),
  });
  const targets = await bootstrapTransport.listTargets();
  const resolved = await resolver.resolve(ctx, targets);
  const transport = new HdcTransport({
    hdcPath: resolved.located.path,
    runner,
    globalArgs: hdcGlobalArgs(),
    env: mergeProcessEnv(ctx.env),
  });
  const deploy = new LiteDeployService({ transport, profile });
  return { profile, transport, deploy, runner, lastBuild };
}

export async function runBuild(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  session: WorkspaceSession,
): Promise<BuildResult> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) throw new OhjsError('BLD-NO-PROJECT', 'No workspace folder');
  const buildCfg = vscode.workspace.getConfiguration('ohjs.build');
  const toolsCfg = vscode.workspace.getConfiguration('ohjs.tools');
  const backend = buildCfg.get<'auto' | 'fixture' | 'ace-loader'>('backend', 'auto');
  const aceLoaderPath = buildCfg.get<string>('aceLoaderPath', '').trim() || undefined;
  const buildMode = buildCfg.get<'debug' | 'release'>('buildMode', 'release');
  const restoolPath = toolsCfg.get<string>('restoolPath', '').trim() || undefined;
  const platform = createHostPlatform();
  const autoProvision = backend === 'auto' || backend === 'ace-loader';
  const r = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'OHJS: Build',
      cancellable: false,
    },
    async () =>
      buildProject(platform, session.runner, {
        workspaceRoot: root,
        backend,
        aceLoaderPath,
        buildMode,
        restoolPath,
        aceLoaderStorageRoot: context.globalStorageUri.fsPath,
        aceLoaderAutoProvision: autoProvision,
        onBuildProgress: (msg) => output.info(msg),
      }),
  );
  lastBuild = r;
  session.lastBuild = r;
  session.moduleInfo = r.module;
  output.info(`build (${r.backend}): ${r.hapPath}`);
  return r;
}

export async function readModuleInfo(session: WorkspaceSession): Promise<FaModuleInfo> {
  if (session.moduleInfo) return session.moduleInfo;
  if (lastBuild?.module) return lastBuild.module;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) throw new OhjsError('BLD-NO-PROJECT', 'No workspace folder');
  const cfg = await vscode.workspace.findFiles('**/src/main/config.json', '**/node_modules/**', 1);
  if (!cfg[0]) throw new OhjsError('BLD-NO-PROJECT', 'No config.json');
  const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(cfg[0]));
  return parseFaConfigJson(text, cfg[0].fsPath);
}

export async function stopLogTail(): Promise<void> {
  if (logTail) {
    await logTail.kill();
    logTail = undefined;
  }
}

export function setLogTail(handle: { kill: () => Promise<void> } | undefined): void {
  logTail = handle;
}

export function isLogStreamActive(): boolean {
  return logTail !== undefined;
}
