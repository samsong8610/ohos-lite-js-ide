/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  fieldsOf,
  listSchemaVersions,
  loadComponentsSchema,
  loadSystemModules,
  validateSystemModulesFile,
  SchemaLoadError,
  validateComponentsFile,
  versionDirName,
} from './index';

const DATA = path.resolve(__dirname, '..');

describe('@ohjs/schemas', () => {
  it('lists and loads the committed data packs', () => {
    expect(listSchemaVersions()).toEqual(['v5.0.3', 'v6.1-lts']);
    const s5 = loadComponentsSchema('5.0.3');
    expect(s5.provisional).toBe(false);
    expect(s5.ohVersion).toBe('5.0.3');
    const s6 = loadComponentsSchema('v6.1-LTS', DATA);
    expect(s6.provisional).toBe(true);
    expect(s6.provisionalReason).toBeTruthy();
  });
  it('versionDirName', () => {
    expect(versionDirName('6.1-LTS')).toBe('v6.1-lts');
    expect(versionDirName('v5.0.3')).toBe('v5.0.3');
  });
  it('fieldsOf merges common and component fields', () => {
    const s = loadComponentsSchema('5.0.3');
    const st = fieldsOf(s, 'div', 'styles');
    expect(st['flex-direction']).toBeDefined();
    expect(st['width']).toBeDefined();
    expect(fieldsOf(s, 'list', 'methods')['scrollTo']).toBeDefined();
    expect(fieldsOf(s, 'nope', 'attributes')).toEqual({});
  });
  it('validation rejects malformed data', () => {
    expect(validateComponentsFile({}).valid).toBe(false);
    const s = JSON.parse(JSON.stringify(loadComponentsSchema('5.0.3')));
    s.components.div.availability = 'maybe';
    const r = validateComponentsFile(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain('/components/div/availability');
  });
  it('load errors', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-schemas-'));
    expect(listSchemaVersions(path.join(d, 'none'))).toEqual([]);
    expect(() => loadComponentsSchema('9.9', d)).toThrow(SchemaLoadError);
    fs.mkdirSync(path.join(d, 'v1'));
    fs.writeFileSync(path.join(d, 'v1/components.json'), '{bad');
    expect(() => loadComponentsSchema('1', d)).toThrow(/invalid JSON/);
    fs.writeFileSync(path.join(d, 'v1/components.json'), '{}');
    expect(() => loadComponentsSchema('1', d)).toThrow(/must have required property/);
    expect(listSchemaVersions(d)).toEqual(['v1']);
    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe('system-modules.json', () => {
  it('loads the committed packs for both versions', () => {
    for (const v of ['5.0.3', '6.1-lts']) {
      const m = loadSystemModules(v)!;
      expect(m.categories).toEqual(['system', 'ohos']);
      expect(m.modules.find((x) => x.name === 'router')!.availability).toBe('available');
    }
  });
  it('validation and load errors', () => {
    expect(validateSystemModulesFile(null).valid).toBe(false);
    expect(
      validateSystemModulesFile({ schemaFormat: 2, categories: [1], modules: [{ availability: 'x' }] })
        .errors,
    ).toEqual([
      '/schemaFormat must be 1',
      '/ohVersion must be a string',
      '/target must be a string',
      '/generator must be a string',
      '/categories must be a string array',
      '/modules/0/name must be a string',
      '/modules/0/availability is invalid',
    ]);
    expect(
      validateSystemModulesFile({
        schemaFormat: 1,
        ohVersion: 'a',
        target: 't',
        generator: 'g',
        categories: [],
      }).errors,
    ).toEqual(['/modules must be an array']);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-sm-'));
    expect(loadSystemModules('9.9', d)).toBeUndefined();
    fs.mkdirSync(path.join(d, 'v9.9'));
    fs.writeFileSync(path.join(d, 'v9.9', 'system-modules.json'), '{');
    expect(() => loadSystemModules('9.9', d)).toThrow(/invalid JSON/);
    fs.writeFileSync(path.join(d, 'v9.9', 'system-modules.json'), '{}');
    expect(() => loadSystemModules('9.9', d)).toThrow(SchemaLoadError);
    fs.rmSync(d, { recursive: true, force: true });
  });
});
