/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { NodeProcessRunner, createHostPlatform, type OutputEncoding } from '@ohjs/core';
import { cleanBuildOutputs } from '@ohjs/build';
import { formatHilogEntry, parseHilogLine } from '@ohjs/transport-hdc';
import { formatOhjsHostError } from './deploy-host-ux';
import {
  createWorkspaceSession,
  clearLastBuild,
  getLastBuild,
  isLogStreamActive,
  readModuleInfo,
  resolveDeviceTarget,
  runBuild,
  setLogTail,
  stopLogTail,
  type WorkspaceSession,
} from './workspace-session';

function showOutput(output: vscode.LogOutputChannel): void {
  output.show(true);
}

function logError(output: vscode.LogOutputChannel, e: unknown): void {
  const { log, toast } = formatOhjsHostError(e);
  output.error(log);
  void vscode.window.showErrorMessage(toast);
}

async function ensureHap(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  session: WorkspaceSession,
): Promise<string> {
  if (!getLastBuild()) {
    await runBuild(context, output, session);
  }
  const hap = getLastBuild()?.hapPath;
  if (!hap) throw new Error('No HAP artifact; run OHJS: Build first');
  return hap;
}

async function runDeploy(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  session: WorkspaceSession,
): Promise<void> {
  const target = await resolveDeviceTarget(output, session.transport);
  const hap = await ensureHap(context, output, session);
  const pre = await session.deploy.preflightDebugFirmware(target);
  if (pre.warning) output.warn(pre.warning);
  const { remotePath } = await session.deploy.deployHap(target, hap);
  await session.deploy.install(target, remotePath);
  output.info(`deploy: installed ${remotePath}`);
}

async function runLaunch(output: vscode.LogOutputChannel, session: WorkspaceSession): Promise<void> {
  const target = await resolveDeviceTarget(output, session.transport);
  const mod = await readModuleInfo(session);
  await session.deploy.startApp(target, { bundle: mod.bundleName, ability: mod.abilityName });
  output.info(`launch: ${mod.bundleName}/${mod.abilityName}`);
}

async function stopDeviceLogCapture(session: WorkspaceSession, target: string): Promise<void> {
  try {
    await session.deploy.stopLogCapture(target);
  } catch {
    /* best-effort when no capture was running */
  }
}

export function registerDeployCommands(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): void {
  const encoding = vscode.workspace
    .getConfiguration('ohjs.advanced')
    .get<OutputEncoding>('outputEncoding', 'auto');
  const runner = new NodeProcessRunner(createHostPlatform(), { encoding });
  context.subscriptions.push({ dispose: () => void runner.disposeAll() });

  const withSession = async <T>(
    fn: (s: Awaited<ReturnType<typeof createWorkspaceSession>>) => Promise<T>,
  ) => {
    const session = await createWorkspaceSession(context, runner);
    try {
      return await fn(session);
    } finally {
      /* runner disposed with extension deactivate via separate registration */
    }
  };

  context.subscriptions.push({
    dispose: () => {
      void stopLogTail();
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.project.clean', async () => {
      showOutput(output);
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) throw new Error('No workspace folder');
        const { removed } = cleanBuildOutputs(root);
        clearLastBuild();
        if (removed.length === 0) {
          output.info('clean: no build outputs to remove');
        } else {
          for (const p of removed) output.info(`clean: removed ${p}`);
        }
        void vscode.window.showInformationMessage(
          removed.length === 0 ? 'OHJS: nothing to clean' : `OHJS: cleaned ${removed.length} path(s)`,
        );
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.project.build', async () => {
      showOutput(output);
      try {
        await withSession(async (s) => runBuild(context, output, s));
        void vscode.window.showInformationMessage('OHJS: build finished');
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.deploy', async () => {
      showOutput(output);
      try {
        await withSession(async (s) => runDeploy(context, output, s));
        void vscode.window.showInformationMessage('OHJS: deploy finished');
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.launch', async () => {
      showOutput(output);
      try {
        await withSession(async (s) => runLaunch(output, s));
        void vscode.window.showInformationMessage('OHJS: app launched');
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.stop', async () => {
      showOutput(output);
      try {
        await withSession(async (s) => {
          const target = await resolveDeviceTarget(output, s.transport);
          const mod = await readModuleInfo(s);
          await s.deploy.stopApp(target, mod.bundleName);
          output.info(`stop: ${mod.bundleName}`);
        });
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.logs.start', async () => {
      showOutput(output);
      if (isLogStreamActive()) {
        output.info('logs: already streaming (OHJS: Stop Logs to end capture)');
        return;
      }
      try {
        await stopLogTail();
        await withSession(async (s) => {
          const target = await resolveDeviceTarget(output, s.transport);
          await stopDeviceLogCapture(s, target);
          await s.deploy.startLogCapture(target);
          const stream = s.deploy.tailLogStream(target);
          setLogTail(stream);
          stream.onStdout((chunk) => {
            for (const line of chunk.split(/\r?\n/)) {
              if (!line.trim()) continue;
              output.info(formatHilogEntry(parseHilogLine(line)));
            }
          });
          stream.onStderr((chunk) => {
            if (chunk.trim()) output.warn(chunk.trim());
          });
          output.info('logs: streaming (OHJS: Stop Logs to end capture)');
        });
      } catch (e) {
        await stopLogTail();
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.logs.stop', async () => {
      showOutput(output);
      try {
        await stopLogTail();
        await withSession(async (s) => {
          const target = await resolveDeviceTarget(output, s.transport);
          await s.deploy.stopLogCapture(target);
          output.info('logs: capture stopped');
        });
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.run', async () => {
      showOutput(output);
      try {
        await withSession(async (s) => {
          await runBuild(context, output, s);
          await runDeploy(context, output, s);
          await runLaunch(output, s);
        });
        void vscode.window.showInformationMessage('OHJS: build, deploy, and launch finished');
      } catch (e) {
        logError(output, e);
      }
    }),
  );
}
