/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { COMPONENTS_FILE_JSON_SCHEMA } from './file-schema';
import type {
  ComponentSchema,
  ComponentsSchemaFile,
  FieldSchema,
  JsCapabilitiesFile,
  SystemModulesFile,
} from './types';

export * from './types';
export { COMPONENTS_FILE_JSON_SCHEMA } from './file-schema';

/** Directory holding the versioned data packs (`<dir>/<version>/components.json`). */
export const DEFAULT_DATA_DIR = path.resolve(__dirname, '..');

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile(COMPONENTS_FILE_JSON_SCHEMA);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateComponentsFile(data: unknown): ValidationResult {
  if (validateFn(data)) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validateFn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`),
  };
}

/** Directory name for an OpenHarmony version: 5.0.3 → v5.0.3, 6.1-LTS → v6.1-lts */
export function versionDirName(ohVersion: string): string {
  return `v${ohVersion.replace(/^v/i, '').toLowerCase()}`;
}

export function listSchemaVersions(dataDir = DEFAULT_DATA_DIR): string[] {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((d) => /^v\d/.test(d) && fs.existsSync(path.join(dataDir, d, 'components.json')))
    .sort();
}

export class SchemaLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaLoadError';
  }
}

export function loadComponentsSchema(ohVersion: string, dataDir = DEFAULT_DATA_DIR): ComponentsSchemaFile {
  const file = path.join(dataDir, versionDirName(ohVersion), 'components.json');
  if (!fs.existsSync(file))
    throw new SchemaLoadError(`no schema data pack for OpenHarmony ${ohVersion} (${file})`);
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new SchemaLoadError(`${file}: invalid JSON: ${(e as Error).message}`);
  }
  const r = validateComponentsFile(data);
  if (!r.valid) throw new SchemaLoadError(`${file}: ${r.errors.slice(0, 5).join('; ')}`);
  return data as ComponentsSchemaFile;
}

export type FieldKind = 'attributes' | 'styles' | 'events' | 'methods';

/** Component field merged with the common ones (component-specific wins). */
export function fieldsOf(
  file: ComponentsSchemaFile,
  tag: string,
  kind: FieldKind,
): Record<string, FieldSchema> {
  const c: ComponentSchema | undefined = file.components[tag];
  if (!c) return {};
  const common = kind === 'methods' ? {} : file.common[kind];
  return { ...common, ...c[kind] };
}

/** Structural check for `system-modules.json` (small format; no JSON Schema needed). */
export function validateSystemModulesFile(data: unknown): ValidationResult {
  const errors: string[] = [];
  const d = data as Partial<SystemModulesFile> | null;
  if (!d || typeof d !== 'object') return { valid: false, errors: ['/ must be an object'] };
  if (d.schemaFormat !== 1) errors.push('/schemaFormat must be 1');
  for (const k of ['ohVersion', 'target', 'generator'] as const)
    if (typeof d[k] !== 'string') errors.push(`/${k} must be a string`);
  if (!Array.isArray(d.categories) || !d.categories.every((c) => typeof c === 'string'))
    errors.push('/categories must be a string array');
  if (!Array.isArray(d.modules)) errors.push('/modules must be an array');
  else
    d.modules.forEach((m, i) => {
      if (!m || typeof m.name !== 'string') errors.push(`/modules/${i}/name must be a string`);
      if (!m || !['available', 'disabled-by-feature', 'conditional'].includes(m.availability))
        errors.push(`/modules/${i}/availability is invalid`);
    });
  return { valid: !errors.length, errors };
}

/** Loads `<dir>/<version>/system-modules.json`; undefined when the pack has none. */
export function loadSystemModules(
  ohVersion: string,
  dataDir = DEFAULT_DATA_DIR,
): SystemModulesFile | undefined {
  const file = path.join(dataDir, versionDirName(ohVersion), 'system-modules.json');
  if (!fs.existsSync(file)) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new SchemaLoadError(`${file}: invalid JSON (${(e as Error).message})`);
  }
  const v = validateSystemModulesFile(data);
  if (!v.valid) throw new SchemaLoadError(`${file}: ${v.errors.join('; ')}`);
  return data as SystemModulesFile;
}

/** Structural check for `js-capabilities.json`. */
export function validateJsCapabilitiesFile(data: unknown): ValidationResult {
  const errors: string[] = [];
  const d = data as Partial<JsCapabilitiesFile> | null;
  if (!d || typeof d !== 'object') return { valid: false, errors: ['/ must be an object'] };
  if (d.schemaFormat !== 1) errors.push('/schemaFormat must be 1');
  for (const k of ['ohVersion', 'generator'] as const)
    if (typeof d[k] !== 'string') errors.push(`/${k} must be a string`);
  if (!d.engine || d.engine.name !== 'jerryscript' || typeof d.engine.apiVersion !== 'string')
    errors.push('/engine must name jerryscript with an apiVersion');
  if (!d.macros || typeof d.macros !== 'object') errors.push('/macros must be an object');
  else
    for (const [k, m] of Object.entries(d.macros))
      if (!m || typeof m.value !== 'number' || typeof m.source !== 'string')
        errors.push(`/macros/${k} needs a numeric value and a source`);
  if (!Array.isArray(d.apis)) errors.push('/apis must be an array');
  else
    d.apis.forEach((a, i) => {
      if (!a || typeof a.name !== 'string' || typeof a.since !== 'string' || typeof a.source !== 'string')
        errors.push(`/apis/${i} needs name, since and source strings`);
      else if (typeof a.available !== 'boolean') errors.push(`/apis/${i}/available must be a boolean`);
      else if (!a.available && typeof a.reason !== 'string')
        errors.push(`/apis/${i}/reason is required when unavailable`);
    });
  return { valid: !errors.length, errors };
}

/** Loads `<dir>/<version>/js-capabilities.json`; undefined when the pack has none. */
export function loadJsCapabilities(
  ohVersion: string,
  dataDir = DEFAULT_DATA_DIR,
): JsCapabilitiesFile | undefined {
  const file = path.join(dataDir, versionDirName(ohVersion), 'js-capabilities.json');
  if (!fs.existsSync(file)) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new SchemaLoadError(`${file}: invalid JSON (${(e as Error).message})`);
  }
  const v = validateJsCapabilitiesFile(data);
  if (!v.valid) throw new SchemaLoadError(`${file}: ${v.errors.join('; ')}`);
  return data as JsCapabilitiesFile;
}
