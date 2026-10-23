/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { DeviceProfileRegistry, type DeviceProfile, type TemplateManifest } from '@ohjs/core';
import { DEFAULT_PROFILE_ID, builtinProfilesDir, loadProfilesFromDir } from '../device-profiles';
import { deviceProfileChoices, runProjectWizard, sdkVersionChoices, type ProjectWizardUi } from './wizard';

function templatesRoot(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath('templates');
}

async function isNonEmptyDirectory(absPath: string): Promise<boolean> {
  try {
    const uri = vscode.Uri.file(absPath);
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type === vscode.FileType.File) return true;
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function writeProjectFiles(
  targetRoot: string,
  files: { relativePath: string; content: Uint8Array }[],
): Promise<void> {
  const rootUri = vscode.Uri.file(targetRoot);
  for (const f of files) {
    const segments = f.relativePath.split('/');
    const fileName = segments.pop()!;
    const dirUri = segments.length ? vscode.Uri.joinPath(rootUri, ...segments) : rootUri;
    await vscode.workspace.fs.createDirectory(dirUri);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dirUri, fileName), f.content);
  }
}

function createWizardUi(): ProjectWizardUi {
  return {
    async pickTemplate(manifests: TemplateManifest[]) {
      const picked = await vscode.window.showQuickPick(
        manifests.map((m) => ({
          label: m.displayName,
          description: m.id,
          detail: m.description,
          manifest: m,
        })),
        { title: vscode.l10n.t('New Project — template'), placeHolder: vscode.l10n.t('Choose a template') },
      );
      return picked?.manifest;
    },
    async pickSdkVersion() {
      const picked = await vscode.window.showQuickPick(
        sdkVersionChoices().map((c) => ({
          label: c.label,
          description: c.description,
          value: c.value,
        })),
        { title: vscode.l10n.t('New Project — SDK version'), placeHolder: vscode.l10n.t('OpenHarmony SDK') },
      );
      return picked?.value;
    },
    async pickDeviceProfile(profiles: DeviceProfile[]) {
      const picked = await vscode.window.showQuickPick(
        deviceProfileChoices(profiles).map((c) => ({
          label: c.label,
          description: c.description,
          detail: c.detail,
          profile: c.value,
        })),
        {
          title: vscode.l10n.t('New Project — device profile'),
          placeHolder: vscode.l10n.t('Target device resolution and profile'),
        },
      );
      return picked?.profile;
    },
    async inputBundleName(initial?: string) {
      return vscode.window.showInputBox({
        title: vscode.l10n.t('New Project — bundle name'),
        prompt: vscode.l10n.t('Reverse-DNS bundle name (e.g. com.example.myapp)'),
        value: initial,
        ignoreFocusOut: true,
      });
    },
    async inputVendor(initial?: string) {
      return vscode.window.showInputBox({
        title: vscode.l10n.t('New Project — vendor'),
        prompt: vscode.l10n.t('Vendor name stored in config.json'),
        value: initial,
        ignoreFocusOut: true,
      });
    },
    async pickTargetDirectory() {
      const folders = await vscode.window.showOpenDialog({
        title: vscode.l10n.t('New Project — target folder'),
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: vscode.l10n.t('Select folder'),
      });
      return folders?.[0]?.fsPath;
    },
    showError(message: string) {
      void vscode.window.showErrorMessage(message);
    },
    showInfo(message: string) {
      void vscode.window.showInformationMessage(message);
    },
  };
}

function loadBuiltinProfiles(context: vscode.ExtensionContext): DeviceProfile[] {
  const registry = new DeviceProfileRegistry();
  loadProfilesFromDir(registry, builtinProfilesDir(context.extensionPath), 'builtin');
  const profiles: DeviceProfile[] = [];
  for (const { id } of registry.list()) {
    try {
      profiles.push(registry.resolve(id));
    } catch {
      // skip invalid entries
    }
  }
  if (!profiles.some((p) => p.id === DEFAULT_PROFILE_ID)) {
    try {
      profiles.unshift(registry.resolve(DEFAULT_PROFILE_ID));
    } catch {
      // no built-in profiles packaged
    }
  }
  return profiles;
}

/** Registers `ohjs.project.new` (FR-PRJ-001). Available even when no OHJS project is open. */
export function registerProjectWizard(context: vscode.ExtensionContext): void {
  const profiles = loadBuiltinProfiles(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('ohjs.project.new', async () => {
      const created = await runProjectWizard({
        templatesRoot: templatesRoot(context),
        deviceProfiles: profiles,
        ui: createWizardUi(),
        isNonEmptyDirectory,
        writeProject: writeProjectFiles,
      });
      if (created) {
        const uri = vscode.Uri.file(created);
        const open = vscode.l10n.t('Open folder');
        const choice = await vscode.window.showInformationMessage(
          vscode.l10n.t('Project created at {0}', created),
          open,
        );
        if (choice === open) {
          await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
        }
      }
    }),
  );
}
