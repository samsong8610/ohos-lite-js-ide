/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OhjsError } from '../../errors';
import { REQUIRED_RESOLVED } from './schema';
import { DEFAULT_TIMEOUTS, type DeviceProfile, type DeviceProfileInput } from './types';
import { validateProfileInput } from './validate';

type Json = Record<string, unknown>;
const isPlain = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep merge: objects merge recursively, arrays and scalars replace. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as T;
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

function getPath(o: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => (isPlain(acc) ? acc[k] : undefined), o);
}

export type ProfileOrigin = 'builtin' | 'user' | 'project';

/** Overrides coming from settings: ohjs.device.profileOverrides / ohjs.device.display (§12). */
export type ProfileOverrides = Omit<Partial<DeviceProfileInput>, 'id' | 'extends'>;

/**
 * Holds built-in, user and project profiles; resolves `extends` chains and overrides
 * (FR-PRJ-008 multi-device / multi-resolution).
 */
export class DeviceProfileRegistry {
  private readonly items = new Map<string, { input: DeviceProfileInput; origin: ProfileOrigin }>();

  add(input: DeviceProfileInput, origin: ProfileOrigin = 'user'): void {
    const issues = validateProfileInput(input);
    if (issues.length) {
      throw new OhjsError(
        'PRJ-PROFILE-INVALID',
        `invalid device profile "${input.id}": ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
      );
    }
    const existing = this.items.get(input.id);
    // project/user profiles may shadow built-ins with the same id, not the other way round
    const rank: Record<ProfileOrigin, number> = { builtin: 0, user: 1, project: 2 };
    if (existing && rank[existing.origin] > rank[origin]) return;
    this.items.set(input.id, { input, origin });
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  list(): Array<{ id: string; name?: string; origin: ProfileOrigin }> {
    return [...this.items.values()]
      .map(({ input, origin }) => ({ id: input.id, name: input.name, origin }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  resolve(id: string, overrides?: ProfileOverrides): DeviceProfile {
    const chain: DeviceProfileInput[] = [];
    const seen = new Set<string>();
    let cur: string | undefined = id;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        throw new OhjsError(
          'PRJ-PROFILE-CYCLE',
          `device profile extends cycle: ${[...seen, cur].join(' → ')}`,
        );
      }
      seen.add(cur);
      const item = this.items.get(cur);
      if (!item) {
        throw new OhjsError(
          'PRJ-PROFILE-NOT-FOUND',
          chain.length === 0
            ? `device profile "${cur}" not found`
            : `device profile "${chain[chain.length - 1]!.id}" extends unknown profile "${cur}"`,
          { hint: `known profiles: ${[...this.items.keys()].join(', ')}` },
        );
      }
      chain.push(item.input);
      cur = item.input.extends;
    }
    let merged: Json = {};
    for (const p of [...chain].reverse()) merged = deepMerge(merged, p);
    if (overrides) merged = deepMerge(merged, overrides);
    const missing = REQUIRED_RESOLVED.filter((k) => getPath(merged, k) === undefined);
    if (missing.length) {
      throw new OhjsError(
        'PRJ-PROFILE-INVALID',
        `device profile "${id}" is incomplete after resolution, missing: ${missing.join(', ')}`,
      );
    }
    const m = merged as unknown as DeviceProfileInput;
    const connection = { fallback: [], ...m.connection } as DeviceProfile['connection'];
    connection.fallback = connection.fallback.filter((f) => f !== connection.preferred);
    return {
      id,
      name: m.name ?? id,
      description: m.description,
      arch: m.arch!,
      kernel: m.kernel!,
      deviceType: m.deviceType!,
      display: m.display as DeviceProfile['display'],
      features: m.features ?? {},
      featuresSource: m.featuresSource,
      connection,
      paths: m.paths as DeviceProfile['paths'],
      commands: m.commands as DeviceProfile['commands'],
      debug: m.debug as DeviceProfile['debug'],
      jerry: m.jerry ?? {},
      timeouts: { ...DEFAULT_TIMEOUTS, ...m.timeouts },
      lineage: chain.map((c) => c.id),
    };
  }
}

/** `.ohjs/project.json` device section (FR-PRJ-008: several targets, one default). */
export interface ProjectDeviceConfig {
  deviceProfiles?: string[];
  defaultDeviceProfile?: string;
  /** legacy single-profile field (ARCHITECTURE §12) */
  deviceProfile?: string;
}

export interface ProfileSelection {
  targets: string[];
  defaultId: string;
}

/**
 * Picks target profiles and the default. Precedence for the default:
 * explicit setting (ohjs.device.profile, when not the schema default) > project default > first target.
 */
export function selectProfiles(
  project: ProjectDeviceConfig | undefined,
  settingProfile: string | undefined,
  fallbackId: string,
): ProfileSelection {
  const targets = [
    ...new Set(project?.deviceProfiles ?? (project?.deviceProfile ? [project.deviceProfile] : [])),
  ];
  let defaultId = project?.defaultDeviceProfile ?? project?.deviceProfile ?? targets[0] ?? fallbackId;
  if (settingProfile && settingProfile !== fallbackId) defaultId = settingProfile;
  if (!targets.includes(defaultId)) targets.unshift(defaultId);
  return { targets, defaultId };
}

/** file send timeout grows with size (ARCHITECTURE §13: ≥ 120 s). */
export function fileSendTimeoutMs(profile: Pick<DeviceProfile, 'timeouts'>, bytes: number): number {
  const t = profile.timeouts;
  return Math.max(t.fileSendMinMs, Math.ceil((bytes / t.fileSendBytesPerSec) * 1000) * 2);
}
