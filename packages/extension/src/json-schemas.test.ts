/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON fixtures are mutated freely in these tests */
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { listSchemaVersions, loadComponentsSchema } from '@ohjs/schemas';

const root = path.resolve(__dirname, '..');
const read = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const config = ajv.compile(read('schemas', 'config.schema.json') as object);
const i18n = ajv.compile(read('schemas', 'i18n.schema.json') as object);
const fixture = read('test', 'fixtures', 'oh-project', 'entry', 'src', 'main', 'config.json') as Record<
  string,
  any
>;
const clone = (): Record<string, any> => structuredClone(fixture);
const errs = (v: typeof config, data: unknown): string[] =>
  v(data) ? [] : v.errors!.map((e) => `${e.instancePath} ${e.keyword}`);

describe('config.schema.json (FR-LANG-008, bm_lite bundle_parser.cpp)', () => {
  it('accepts the fixture project', () => {
    expect(errs(config, fixture)).toEqual([]);
  });
  it('rejects what bm_lite rejects', () => {
    const cases: Array<[(c: Record<string, any>) => void, string]> = [
      [(c) => delete c.module, ' required'],
      [(c) => (c.app.bundleName = 'short'), '/app/bundleName minLength'],
      [(c) => (c.app.bundleName = 'nodots_here'), '/app/bundleName pattern'],
      [(c) => (c.app.version.code = -1), '/app/version/code minimum'],
      [(c) => (c.module.deviceType = ['smartvision']), '/module/deviceType contains'],
      [(c) => (c.module.distro.moduleType = 'har'), '/module/distro/moduleType enum'],
      [(c) => (c.module.distro.deliveryWithInstall = 'yes'), '/module/distro/deliveryWithInstall type'],
      [(c) => (c.module.distro.moduleName = '../x'), '/module/distro/moduleName not'],
      [(c) => delete c.module.abilities[0].type, '/module/abilities/0 required'],
      [(c) => (c.module.js[0].pages = []), '/module/js/0/pages minItems'],
      [(c) => (c.app.apiVersion = { target: 5 }), '/app/apiVersion required'],
    ];
    for (const [mutate, expected] of cases) {
      const c = clone();
      mutate(c);
      expect(errs(config, c)).toContain(expected);
    }
    const ok = clone();
    ok.module.abilities[0].type = 'custom'; // bm_lite maps unknown types to UNKNOWN instead of failing
    ok.deviceConfig = null;
    ok.app.apiVersion = { compatible: 5, target: 6 };
    expect(errs(config, ok)).toEqual([]);
  });
});

describe('i18n.schema.json', () => {
  it('nested objects with string leaves', () => {
    for (const f of ['en-US.json', 'zh-CN.json'])
      expect(
        errs(
          i18n,
          read('test', 'fixtures', 'oh-project', 'entry', 'src', 'main', 'js', 'default', 'i18n', f),
        ),
      ).toEqual([]);
    expect(errs(i18n, { a: { b: 'x' } })).toEqual([]);
    expect(i18n({ a: 1 })).toBe(false);
    expect(i18n({ a: ['x'] })).toBe(false);
  });
});

describe('contributes', () => {
  const pkg = read('package.json') as { contributes: Record<string, any> };
  it('wires both schemas and the CSS injection grammar', () => {
    expect(pkg.contributes.jsonValidation).toEqual([
      { fileMatch: '**/src/main/config.json', url: './schemas/config.schema.json' },
      { fileMatch: '**/src/main/js/*/i18n/*.json', url: './schemas/i18n.schema.json' },
    ]);
    const inj = pkg.contributes.grammars.find(
      (g: { scopeName: string }) => g.scopeName === 'source.css.ohlite.injection',
    );
    expect(inj).toMatchObject({
      path: './syntaxes/css-ohlite.injection.json',
      injectTo: ['source.css', 'source.css.less', 'source.css.scss'],
    });
  });
  it('the injection grammar lists exactly the style names of all bundled schema packs', () => {
    const g = read('syntaxes', 'css-ohlite.injection.json') as {
      repository: Record<string, { match: string }>;
    };
    const m = /\(\?<!\[\\w-\]\)\((.*)\)\(\?=/.exec(g.repository['lite-property-name']!.match)!;
    const names = new Set<string>();
    for (const v of listSchemaVersions()) {
      const s = loadComponentsSchema(v);
      for (const n of Object.keys(s.common.styles)) names.add(n);
      for (const c of Object.values(s.components)) for (const n of Object.keys(c.styles)) names.add(n);
    }
    expect(m[1]!.split('|').sort()).toEqual([...names].sort());
  });
});
