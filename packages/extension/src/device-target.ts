/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import type { DeviceProfile, DisplaySize } from '@ohjs/core';
import type { DeviceTargetChoice } from './project-wizard/wizard';

const SIZE_MIN = 1;
const SIZE_MAX = 8192;

interface TargetItem extends vscode.QuickPickItem {
  targetKind: 'profile' | 'custom';
  profile: DeviceProfile;
}

/** QuickPick over built-in profiles plus a "custom display size" entry. */
export async function pickDeviceTarget(
  profiles: DeviceProfile[],
  customBase: DeviceProfile,
): Promise<DeviceTargetChoice | undefined> {
  const items: TargetItem[] = profiles.map((p) => ({
    label: p.name,
    description: `${p.display.width}×${p.display.height} · ${p.deviceType}`,
    detail: p.id,
    targetKind: 'profile',
    profile: p,
  }));
  items.push({
    label: vscode.l10n.t('Custom display size…'),
    description: vscode.l10n.t('Enter width and height'),
    detail: customBase.id,
    targetKind: 'custom',
    profile: customBase,
  });
  const picked = await vscode.window.showQuickPick<TargetItem>(items, {
    title: vscode.l10n.t('Target device'),
    placeHolder: vscode.l10n.t('Device model or custom display size'),
  });
  if (!picked) return undefined;
  return { kind: picked.targetKind, profile: picked.profile };
}

/** Asks width then height in pixels; undefined when either prompt is cancelled. */
export async function promptDisplaySize(initial: DisplaySize): Promise<DisplaySize | undefined> {
  const width = await promptDimension('width', initial.width);
  if (width === undefined) return undefined;
  const height = await promptDimension('height', initial.height);
  if (height === undefined) return undefined;
  return { width, height };
}

async function promptDimension(axis: 'width' | 'height', initial: number): Promise<number | undefined> {
  const raw = await vscode.window.showInputBox({
    title: vscode.l10n.t('Display size — {0}', axis),
    prompt: vscode.l10n.t('Pixels ({0}-{1})', SIZE_MIN, SIZE_MAX),
    value: String(initial),
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      const n = Number(trimmed);
      if (!/^\d+$/.test(trimmed) || n < SIZE_MIN || n > SIZE_MAX) {
        return vscode.l10n.t('Enter a whole number from {0} to {1}.', SIZE_MIN, SIZE_MAX);
      }
      return undefined;
    },
  });
  if (raw === undefined) return undefined;
  return Number(raw.trim());
}
