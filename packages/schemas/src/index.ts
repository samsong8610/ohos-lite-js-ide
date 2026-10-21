/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { COMPONENTS_FILE_JSON_SCHEMA } from './file-schema';
import type { ComponentSchema, ComponentsSchemaFile, FieldSchema } from './types';

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
