/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  OhjsError,
  type DeviceProfile,
  type OhSdkVersion,
  type TemplateManifest,
  listProjectTemplates,
  renderProjectTemplate,
  validateBundleName,
} from '@ohjs/core';

export interface WizardPickItem<T = string> {
  label: string;
  description?: string;
  detail?: string;
  value: T;
}

export interface ProjectWizardUi {
  pickTemplate(manifests: TemplateManifest[]): Promise<TemplateManifest | undefined>;
  pickSdkVersion(): Promise<OhSdkVersion | undefined>;
  pickDeviceProfile(profiles: DeviceProfile[]): Promise<DeviceProfile | undefined>;
  inputBundleName(initial?: string): Promise<string | undefined>;
  inputVendor(initial?: string): Promise<string | undefined>;
  pickTargetDirectory(): Promise<string | undefined>;
  showError(message: string): void;
  showInfo(message: string): void;
}

export interface ProjectWizardDeps {
  templatesRoot: string;
  deviceProfiles: DeviceProfile[];
  ui: ProjectWizardUi;
  /** Returns true when the target folder already exists and is non-empty. */
  isNonEmptyDirectory: (absPath: string) => Promise<boolean>;
  writeProject: (targetRoot: string, files: { relativePath: string; content: Uint8Array }[]) => Promise<void>;
}

const SDK_OPTIONS: OhSdkVersion[] = ['5.0.3', '6.1-lts'];

export function sdkVersionChoices(): WizardPickItem<OhSdkVersion>[] {
  return SDK_OPTIONS.map((value) => ({
    value,
    label: value === '5.0.3' ? 'OpenHarmony 5.0.3' : 'OpenHarmony 6.1-LTS',
    description: value,
  }));
}

export function deviceProfileChoices(profiles: DeviceProfile[]): WizardPickItem<DeviceProfile>[] {
  return profiles.map((p) => ({
    value: p,
    label: p.name,
    description: `${p.display.width}×${p.display.height} · ${p.deviceType}`,
    detail: p.id,
  }));
}

/** Multi-step new-project flow (FR-PRJ-001 / FR-PRJ-002). Returns the created project root or undefined when cancelled. */
export async function runProjectWizard(deps: ProjectWizardDeps): Promise<string | undefined> {
  const manifests = listProjectTemplates(deps.templatesRoot);
  if (!manifests.length) {
    deps.ui.showError('No project templates found in the extension package.');
    return undefined;
  }
  if (!deps.deviceProfiles.length) {
    deps.ui.showError('No device profiles available.');
    return undefined;
  }

  const template = await deps.ui.pickTemplate(manifests);
  if (!template) return undefined;

  const sdkVersion = await deps.ui.pickSdkVersion();
  if (!sdkVersion) return undefined;

  return runProjectWizardWithChoices(deps, {
    templateId: template.id,
    sdkVersion,
    profiles: deps.deviceProfiles,
  });
}

/** Same as {@link runProjectWizard} with pre-filled steps (for tests). */
export async function runProjectWizardWithChoices(
  deps: ProjectWizardDeps,
  steps: {
    templateId: string;
    sdkVersion: OhSdkVersion;
    profiles: DeviceProfile[];
    bundleName?: string;
    vendor?: string;
    targetRoot?: string;
  },
): Promise<string | undefined> {
  if (!steps.profiles.length) {
    deps.ui.showError('No device profiles available.');
    return undefined;
  }

  const profile =
    steps.profiles.length === 1 ? steps.profiles[0] : await deps.ui.pickDeviceProfile(steps.profiles);
  if (!profile) return undefined;

  let bundleName = steps.bundleName;
  while (bundleName === undefined) {
    const raw = await deps.ui.inputBundleName('com.example.myapp');
    if (raw === undefined) return undefined;
    const v = validateBundleName(raw);
    if (!v.ok) {
      deps.ui.showError(v.message ?? 'Invalid bundle name.');
      continue;
    }
    bundleName = raw.trim();
  }

  let vendor = steps.vendor;
  if (vendor === undefined) {
    const raw = await deps.ui.inputVendor('example');
    if (raw === undefined) return undefined;
    vendor = raw.trim() || 'example';
  }

  let targetRoot = steps.targetRoot;
  if (targetRoot === undefined) {
    const picked = await deps.ui.pickTargetDirectory();
    if (!picked) return undefined;
    targetRoot = picked;
  }

  if (await deps.isNonEmptyDirectory(targetRoot)) {
    deps.ui.showError('Target folder already exists and is not empty. Choose an empty or new directory.');
    return undefined;
  }

  try {
    const files = renderProjectTemplate(deps.templatesRoot, steps.templateId, {
      bundleName,
      vendor,
      sdkVersion: steps.sdkVersion,
      deviceProfileId: profile.id,
      display: { width: profile.display.width, height: profile.display.height },
    });
    await deps.writeProject(targetRoot, files);
    deps.ui.showInfo(`Created OpenHarmony Lite JS project at ${targetRoot}`);
    return targetRoot;
  } catch (e) {
    const msg = e instanceof OhjsError ? e.message : (e as Error).message;
    deps.ui.showError(`Failed to create project: ${msg}`);
    return undefined;
  }
}
