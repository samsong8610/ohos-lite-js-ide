/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import type { DeviceProfile, DeviceProfileRegistry, ProjectDeviceConfig } from '@ohjs/core';
import { parseDeviceProfile, selectProfiles, type ProfileOrigin } from '@ohjs/core';

export const DEFAULT_PROFILE_ID = 'cp2a070-la401';

/** Every registry profile that resolves (invalid project-level entries are skipped). */
export function resolveProfiles(registry: DeviceProfileRegistry): DeviceProfile[] {
  const profiles: DeviceProfile[] = [];
  for (const { id } of registry.list()) {
    try {
      profiles.push(registry.resolve(id));
    } catch {
      // skip invalid entries
    }
  }
  return profiles;
}

/** Loads every *.json profile in a directory into the registry (built-ins or `.ohjs/device-profiles`). */
export function loadProfilesFromDir(
  registry: DeviceProfileRegistry,
  dir: string,
  origin: ProfileOrigin,
): string[] {
  if (!fs.existsSync(dir)) return [];
  const ids: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name.endsWith('.schema.json')) continue;
    const file = path.join(dir, name);
    const profile = parseDeviceProfile(fs.readFileSync(file, 'utf8'), file);
    registry.add(profile, origin);
    ids.push(profile.id);
  }
  return ids;
}

export function builtinProfilesDir(extensionRoot: string): string {
  return path.join(extensionRoot, 'device-profiles');
}

/** Project-level profile directory of a workspace folder. */
export function projectProfilesDir(folder: string): string {
  return path.join(folder, '.ohjs', 'device-profiles');
}

/** `.ohjs/project.json` device section of the first folder that has one. */
export function readProjectDeviceConfig(folders: readonly string[]): ProjectDeviceConfig | undefined {
  for (const folder of folders) {
    const file = path.join(folder, '.ohjs', 'project.json');
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      if (typeof parsed === 'object' && parsed !== null) return parsed as ProjectDeviceConfig;
    } catch {
      // malformed project.json is reported by the language server; fall back to the setting
    }
  }
  return undefined;
}

/** Explicit setting > project `defaultDeviceProfile` > built-in default. */
export function activeProfileId(
  folders: readonly string[],
  settingProfile: string,
  fallbackId = DEFAULT_PROFILE_ID,
): string {
  return selectProfiles(readProjectDeviceConfig(folders), settingProfile, fallbackId).defaultId;
}
