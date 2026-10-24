/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { NodeProcessRunner, createHostPlatform, isOhjsError, type OutputEncoding } from '@ohjs/core';
import { cleanBuildOutputs } from '@ohjs/build';
import { formatHilogEntry, parseHilogLine } from '@ohjs/transport-hdc';
import {
  createWorkspaceSession,
  clearLastBuild,
  getLastBuild,
  readModuleInfo,
  resolveDeviceTarget,
  runBuild,
  setLogTail,
  stopLogTail,
} from './workspace-session';

function logError(output: vscode.LogOutputChannel, e: unknown): void {
  const base = isOhjsError(e) ? `[${e.code}] ${e.message}` : (e as Error).message;
  const hint = isOhjsError(e) ? e.detail.hint : undefined;
  const msg = hint ? `${base}\nHint: ${hint}` : base;
  output.error(msg);
  void vscode.window.showErrorMessage(hint ? `${base} — ${hint}` : base);
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

  context.subscriptions.push({ dispose: () => void stopLogTail() });

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.project.clean', async () => {
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
      try {
        await withSession(async (s) => runBuild(output, s));
        void vscode.window.showInformationMessage('OHJS: build finished');
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.deploy', async () => {
      try {
        await withSession(async (s) => {
          const target = await resolveDeviceTarget(output, s.transport);
          const build = getLastBuild();
          if (!build) {
            await runBuild(output, s);
          }
          const hap = getLastBuild()?.hapPath;
          if (!hap) throw new Error('No HAP artifact; run OHJS: Build first');
          const pre = await s.deploy.preflightDebugFirmware(target);
          if (pre.warning) output.warn(pre.warning);
          const { remotePath } = await s.deploy.deployHap(target, hap);
          await s.deploy.install(target, remotePath);
          output.info(`deploy: installed ${remotePath}`);
        });
        void vscode.window.showInformationMessage('OHJS: deploy finished');
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.launch', async () => {
      try {
        await withSession(async (s) => {
          const target = await resolveDeviceTarget(output, s.transport);
          const mod = await readModuleInfo(s);
          await s.deploy.startApp(target, { bundle: mod.bundleName, ability: mod.abilityName });
          output.info(`launch: ${mod.bundleName}/${mod.abilityName}`);
        });
        void vscode.window.showInformationMessage('OHJS: app launched');
      } catch (e) {
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.app.stop', async () => {
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
      try {
        await stopLogTail();
        await withSession(async (s) => {
          const target = await resolveDeviceTarget(output, s.transport);
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
        logError(output, e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.logs.stop', async () => {
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
      try {
        await vscode.commands.executeCommand('ohjs.project.build');
        await vscode.commands.executeCommand('ohjs.app.deploy');
        await vscode.commands.executeCommand('ohjs.app.launch');
      } catch (e) {
        logError(output, e);
      }
    }),
  );
}
