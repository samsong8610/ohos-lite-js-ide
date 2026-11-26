/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OhjsError } from '../../errors';

/** Fixed id of the per-project profile that carries a custom display size. */
export const CUSTOM_PROFILE_ID = 'custom';

export interface DisplaySize {
  width: number;
  height: number;
}

const SIZE_MIN = 1;
const SIZE_MAX = 8192;

export function validateDisplaySize(size: DisplaySize): { ok: boolean; message?: string } {
  for (const [label, value] of [
    ['Width', size.width],
    ['Height', size.height],
  ] as const) {
    if (!Number.isInteger(value) || value < SIZE_MIN || value > SIZE_MAX) {
      return { ok: false, message: `${label} must be an integer between ${SIZE_MIN} and ${SIZE_MAX}.` };
    }
  }
  return { ok: true };
}

/** `.ohjs/device-profiles/custom.json`: base profile's paths/commands, custom display. */
export function customProfileJson(baseId: string, size: DisplaySize): string {
  const profile = {
    id: CUSTOM_PROFILE_ID,
    extends: baseId,
    name: `Custom ${size.width}×${size.height}`,
    display: { width: size.width, height: size.height },
  };
  return JSON.stringify(profile, null, 2) + '\n';
}

/** Rewrites `.ohjs/project.json` so `profileId` is the default target profile. */
export function mergeProjectDeviceTarget(raw: string | undefined, profileId: string): string {
  let json: Record<string, unknown> = {};
  if (raw !== undefined && raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new OhjsError(
        'PRJ-SCAFFOLD-FAILED',
        `.ohjs/project.json is not valid JSON: ${(e as Error).message}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new OhjsError('PRJ-SCAFFOLD-FAILED', '.ohjs/project.json root must be an object');
    }
    json = parsed as Record<string, unknown>;
  }
  const listed = Array.isArray(json['deviceProfiles'])
    ? (json['deviceProfiles'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  json['defaultDeviceProfile'] = profileId;
  json['deviceProfiles'] = [...new Set([profileId, ...listed])];
  return JSON.stringify(json, null, 2) + '\n';
}
