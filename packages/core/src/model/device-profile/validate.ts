/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { OhjsError } from '../../errors';
import { COMMAND_PLACEHOLDERS, DEVICE_PROFILE_JSON_SCHEMA, type CommandKey } from './schema';
import { templatePlaceholders } from './template';
import type { DeviceProfileInput } from './types';

let compiled: ValidateFunction | undefined;
function validator(): ValidateFunction {
  compiled ??= new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(
    DEVICE_PROFILE_JSON_SCHEMA,
  );
  return compiled;
}

export interface ProfileIssue {
  path: string;
  message: string;
}

function fromAjv(errors: ErrorObject[] | null | undefined): ProfileIssue[] {
  return (errors ?? []).map((e) => ({
    path: e.instancePath || '/',
    message:
      e.keyword === 'additionalProperties'
        ? `unknown property "${(e.params as { additionalProperty: string }).additionalProperty}"`
        : (e.message ?? e.keyword),
  }));
}

/** Schema + semantic validation (placeholders allowed per command). Returns issues, empty = valid. */
export function validateProfileInput(input: unknown): ProfileIssue[] {
  const v = validator();
  if (!v(input)) return fromAjv(v.errors);
  const p = input as DeviceProfileInput;
  const issues: ProfileIssue[] = [];
  for (const [key, tpl] of Object.entries(p.commands ?? {})) {
    const allowed: readonly string[] = COMMAND_PLACEHOLDERS[key as CommandKey];
    for (const name of templatePlaceholders(tpl as string)) {
      if (!allowed.includes(name)) {
        issues.push({
          path: `/commands/${key}`,
          message: `placeholder {${name}} is not allowed (allowed: ${allowed.map((a) => `{${a}}`).join(', ') || 'none'})`,
        });
      }
    }
  }
  const c = p.connection;
  if (c?.preferred && c.fallback?.includes(c.preferred)) {
    issues.push({
      path: '/connection/fallback',
      message: 'fallback must not contain the preferred connection',
    });
  }
  return issues;
}

/** Parses a profile JSON document and throws PRJ-PROFILE-INVALID with every issue. */
export function parseDeviceProfile(text: string, source = '<profile>'): DeviceProfileInput {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new OhjsError('PRJ-PROFILE-INVALID', `${source}: invalid JSON: ${(e as Error).message}`, {}, e);
  }
  const issues = validateProfileInput(json);
  if (issues.length > 0) {
    throw new OhjsError(
      'PRJ-PROFILE-INVALID',
      `${source}: invalid device profile:\n` + issues.map((i) => `  ${i.path}: ${i.message}`).join('\n'),
      { raw: text },
    );
  }
  return json as DeviceProfileInput;
}
