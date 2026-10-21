/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import type { DeviceProfileRegistry } from '@ohjs/core';
import { parseDeviceProfile, type ProfileOrigin } from '@ohjs/core';

export const DEFAULT_PROFILE_ID = '2k0300-1024x768';

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
