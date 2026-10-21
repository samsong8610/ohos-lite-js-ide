/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadSystemModules } from '@ohjs/schemas';
import {
  BASE_EXTENDS,
  JSCONFIG_BASE,
  OHJS_DIR,
  TYPES_DIR,
  generateEnvDts,
  generateSystemModulesDts,
  jsconfigBase,
  planJsconfig,
  TYPES_INCLUDE,
} from './index';

describe('generateSystemModulesDts', () => {
  for (const v of ['5.0.3', '6.1-lts']) {
    it(`declares exactly the linux-available modules of ${v}, both prefixes`, () => {
      const pack = loadSystemModules(v)!;
      const dts = generateSystemModulesDts(pack);
      const declared = [...dts.matchAll(/declare module '@(\w+)\.([\w.]+)'/g)].map((m) => `${m[1]}.${m[2]}`);
      const avail = pack.modules.filter((m) => m.availability === 'available').map((m) => m.name);
      expect(declared).toEqual(avail.flatMap((n) => [`system.${n}`, `ohos.${n}`]));
      expect(dts).not.toContain("'@system.fetch'");
      expect(dts).toContain('replace(options: RouterOptions): void;');
      expect(dts).toContain('showDialog(options: ShowDialogOptions): void;');
      expect(dts).toContain(`OpenHarmony ${pack.ohVersion}`);
      expect(dts).toMatch(
        /declare module '@system\.storage' \{\n {2}\/\/ API surface implemented outside ace_engine_lite; not verified from source, typed loosely\.\n {2}const storage: any;\n {2}export default storage;/,
      );
    });
  }
  it('sanitises dotted names into identifiers', () => {
    const dts = generateSystemModulesDts({
      schemaFormat: 1,
      ohVersion: 'x',
      target: 'linux',
      generator: 'g',
      categories: ['system'],
      modules: [{ name: 'a.b', availability: 'available', evidence: [] }],
    });
    expect(dts).toContain("declare module '@system.a.b' {\n  // API");
    expect(dts).toContain('const a_b: any;');
  });
});

describe('env d.ts and jsconfig base', () => {
  it('globals and the ViewModel interface', () => {
    const d = generateEnvDts();
    for (const s of [
      'declare var console',
      'declare function setTimeout',
      'declare function requireNative',
      'declare function getApp',
      'interface OhjsViewModel',
      '$t(path: string',
      '$watch(',
      '$refs:',
    ])
      expect(d).toContain(s);
  });
  it('ES5 profile with include paths relative to .ohjs/', () => {
    const b = JSON.parse(jsconfigBase());
    expect(b.compilerOptions).toMatchObject({ target: 'ES5', lib: ['es5'], allowJs: true, checkJs: false });
    expect(b.include).toEqual(['../**/src/main/js/**/*.js', 'types/**/*.d.ts']);
  });
});

describe('planJsconfig (never overwrite the user jsconfig)', () => {
  it('creates when absent', () => {
    expect(planJsconfig(undefined)).toEqual({
      action: 'create',
      content: `{\n  "extends": "${BASE_EXTENDS}"\n}\n`,
    });
  });
  it('nothing to do when the base is already extended (any spelling)', () => {
    expect(planJsconfig('{ "extends": "./.ohjs/jsconfig.base.json" }')).toEqual({ action: 'none' });
    expect(
      planJsconfig(
        '// c\n{ "extends": [".ohjs\\\\jsconfig.base.json"], "include": ["src", ".ohjs/types/**/*.d.ts"], }',
      ),
    ).toEqual({ action: 'none' });
  });
  it('merges: adds extends (array when one exists) and the types include', () => {
    const p = planJsconfig(
      '{ /* mine */ "compilerOptions": { "checkJs": true }, "include": ["src/**/*.js"] }',
    );
    expect(p.action).toBe('merge');
    if (p.action !== 'merge') return;
    expect(JSON.parse(p.content)).toEqual({
      compilerOptions: { checkJs: true },
      include: ['src/**/*.js', TYPES_INCLUDE],
      extends: BASE_EXTENDS,
    });
    expect(p.changes).toEqual([`extends += ${BASE_EXTENDS}`, `include += ${TYPES_INCLUDE}`]);
    const q = planJsconfig('{ "extends": "@tsconfig/node" }');
    expect(q.action === 'merge' && JSON.parse(q.content).extends).toEqual(['@tsconfig/node', BASE_EXTENDS]);
  });
  it('reports unparsable files instead of touching them', () => {
    expect(planJsconfig('{ "a": ').action).toBe('unparsable');
    expect(planJsconfig('[1]')).toEqual({ action: 'unparsable', error: 'not a JSON object' });
    expect(planJsconfig('null')).toEqual({ action: 'unparsable', error: 'not a JSON object' });
  });
});

describe('generated declarations are valid TypeScript', () => {
  it('no syntax errors (ts.transpileModule)', async () => {
    const ts = (await import('typescript')).default;
    for (const text of [generateEnvDts(), generateSystemModulesDts(loadSystemModules('6.1-lts')!)]) {
      const r = ts.transpileModule(text, { reportDiagnostics: true, fileName: 'x.ts' });
      expect(r.diagnostics ?? []).toEqual([]);
    }
  });
});

describe('project template .gitignore', () => {
  it('ignores exactly the regenerated .ohjs files (project.json stays versioned)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const lines = fs
      .readFileSync(path.resolve(__dirname, '../../../../templates/common/gitignore'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('/.ohjs'));
    expect(lines).toEqual([`/${OHJS_DIR}/${TYPES_DIR}/`, `/${OHJS_DIR}/${JSCONFIG_BASE}`]);
  });
});
