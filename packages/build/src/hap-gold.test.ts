/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHostPlatform } from '@ohjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildProject } from './build-service';
import { devecoHapOutputPath } from './hap-paths';
import { JERRY_BC_MAGIC, PNG_MAGIC, RESTOOL_INDEX_MAGIC, normalizePreviewCssEntry } from './hap-content';
import { parseFaConfigJson } from './project-info';

const helloliteFixtureRoot = path.join(__dirname, '../test/fixtures/hellolite-lite');

function copyHelloliteWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-hellolite-'));
  fs.cpSync(helloliteFixtureRoot, root, { recursive: true });
  return root;
}
const goldHap = path.join(__dirname, '../test/fixtures/gold-hap/entry-default.gold.hap');
const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');
const restoolShim = path.join(__dirname, '../test/fixtures/restool-shim/restool.cjs');

const GOLD_HAP_PATHS = [
  'config.json',
  'pack.info',
  'assets/entry/resources.index',
  'assets/entry/resources/base/media/icon.png',
  'assets/entry/resources/base/media/icon_small.png',
  'assets/js/MainAbility/app.js',
  'assets/js/MainAbility/app.bc',
  'assets/js/MainAbility/manifest.json',
  'assets/js/MainAbility/i18n/en-US.json',
  'assets/js/MainAbility/i18n/zh-CN.json',
  'assets/js/MainAbility/pages/index/index.js',
  'assets/js/MainAbility/pages/index/index.bc',
  'assets/js/MainAbility/preview_css.json',
  'assets/js/MainAbility/image_convert_result.txt',
];

const GOLD_SIZE_BANDS: Record<string, { min: number; max: number }> = {
  'assets/js/MainAbility/app.bc': { min: 700, max: 900 },
  'assets/js/MainAbility/pages/index/index.bc': { min: 1100, max: 1500 },
  'assets/entry/resources.index': { min: 800, max: 900 },
  'assets/entry/resources/base/media/icon.png': { min: 5000, max: 8000 },
  'assets/entry/resources/base/media/icon_small.png': { min: 4500, max: 7000 },
  'assets/js/MainAbility/app.js': { min: 700, max: 800 },
  'assets/js/MainAbility/pages/index/index.js': { min: 1250, max: 1350 },
};

function listZipPaths(hapPath: string): string[] {
  const out = execFileSync('unzip', ['-Z1', hapPath], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function readZipBytes(hapPath: string, entry: string): Buffer {
  return execFileSync('unzip', ['-p', hapPath, entry], { encoding: 'buffer' }) as Buffer;
}

function readZipJson(hapPath: string, entry: string): unknown {
  return JSON.parse(readZipBytes(hapPath, entry).toString('utf8'));
}

function assertMagic(buf: Buffer, magic: Buffer, label: string): void {
  expect(buf.length, `${label} length`).toBeGreaterThanOrEqual(magic.length);
  expect(buf.subarray(0, magic.length).equals(magic), `${label} magic`).toBe(true);
}

function assertSizeBand(entry: string, buf: Buffer): void {
  const band = GOLD_SIZE_BANDS[entry];
  if (!band) return;
  expect(buf.length, `${entry} size`).toBeGreaterThanOrEqual(band.min);
  expect(buf.length, `${entry} size`).toBeLessThanOrEqual(band.max);
}

describe('HAP gold acceptance (DevEco 3.1 Lite JS)', () => {
  const outDirs: string[] = [];
  let prevRestool: string | undefined;

  beforeAll(() => {
    prevRestool = process.env.OHJS_RESTOOL;
    process.env.OHJS_RESTOOL = restoolShim;
  });

  afterEach(() => {
    for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true });
    outDirs.length = 0;
  });

  afterAll(() => {
    if (prevRestool === undefined) delete process.env.OHJS_RESTOOL;
    else process.env.OHJS_RESTOOL = prevRestool;
  });

  it('gold reference hap contains expected path set and content magics', () => {
    const paths = listZipPaths(goldHap);
    for (const p of GOLD_HAP_PATHS) {
      expect(paths, `gold missing ${p}`).toContain(p);
    }
    for (const p of GOLD_HAP_PATHS) {
      const buf = readZipBytes(goldHap, p);
      assertSizeBand(p, buf);
      if (p.endsWith('.bc')) assertMagic(buf, JERRY_BC_MAGIC, p);
      if (p.endsWith('resources.index')) assertMagic(buf, RESTOOL_INDEX_MAGIC, p);
      if (p.endsWith('.png')) assertMagic(buf, PNG_MAGIC, p);
    }
  });

  it('ace-loader build matches gold zip layout and content-level acceptance', async () => {
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
    const helloliteRoot = copyHelloliteWorkspace();
    outDirs.push(helloliteRoot);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-gold-'));
    outDirs.push(outDir);

    const cfg = path.join(helloliteRoot, 'entry/src/main/config.json');
    const module = parseFaConfigJson(fs.readFileSync(cfg, 'utf8'), cfg);
    const expectedHap = devecoHapOutputPath(module);

    const r = await buildProject(platform, runner, {
      workspaceRoot: helloliteRoot,
      outDir,
      backend: 'ace-loader',
      aceLoaderPath: fakeAceRoot,
    });
    expect(r.hapPath).toBe(expectedHap);
    expect(fs.existsSync(r.hapPath)).toBe(true);

    const builtPaths = listZipPaths(r.hapPath);
    expect(builtPaths.sort()).toEqual(listZipPaths(goldHap).sort());

    for (const p of GOLD_HAP_PATHS) {
      const built = readZipBytes(r.hapPath, p);
      const gold = readZipBytes(goldHap, p);
      assertSizeBand(p, built);
      if (p.endsWith('.bc')) assertMagic(built, JERRY_BC_MAGIC, p);
      if (p.endsWith('resources.index')) assertMagic(built, RESTOOL_INDEX_MAGIC, p);
      if (p.endsWith('.png')) assertMagic(built, PNG_MAGIC, p);

      if (p.endsWith('.js') && !p.includes('i18n')) {
        expect(built.equals(gold), `${p} body should match gold DevEco build`).toBe(true);
      }
      if (p.endsWith('resources.index')) {
        expect(built.equals(gold), 'resources.index should match gold Restool output').toBe(true);
      }
      if (p.endsWith('.bc')) {
        expect(built.equals(gold), `${p} should match gold Jerry snapshot`).toBe(true);
      }
    }

    const builtConfig = readZipJson(r.hapPath, 'config.json') as Record<string, unknown>;
    const goldConfig = readZipJson(goldHap, 'config.json') as Record<string, unknown>;
    expect(builtConfig).toMatchObject({
      app: goldConfig['app'],
      module: {
        mainAbility: 'MyMainAbility',
        package: null,
        deviceType: ['smartVision'],
      },
    });
    const builtModule = builtConfig['module'] as Record<string, unknown>;
    const goldModule = goldConfig['module'] as Record<string, unknown>;
    const builtAbilities = builtModule['abilities'] as Record<string, unknown>[];
    const goldAbilities = goldModule['abilities'] as Record<string, unknown>[];
    expect(builtAbilities[0]).toMatchObject({
      name: goldAbilities[0]!['name'],
      srcPath: goldAbilities[0]!['srcPath'],
      descriptionId: goldAbilities[0]!['descriptionId'],
      labelId: goldAbilities[0]!['labelId'],
      iconId: goldAbilities[0]!['iconId'],
    });

    const builtPack = readZipJson(r.hapPath, 'pack.info') as Record<string, unknown>;
    const goldPack = readZipJson(goldHap, 'pack.info') as Record<string, unknown>;
    expect(builtPack['summary']).toEqual(goldPack['summary']);
    expect(builtPack['packages']).toEqual(goldPack['packages']);

    const builtPreview = readZipJson(r.hapPath, 'assets/js/MainAbility/preview_css.json') as {
      entry: Record<string, unknown>;
    };
    const goldPreview = readZipJson(goldHap, 'assets/js/MainAbility/preview_css.json') as {
      entry: Record<string, unknown>;
    };
    expect(normalizePreviewCssEntry(builtPreview.entry)).toEqual(normalizePreviewCssEntry(goldPreview.entry));

    runner.disposeAll();
  });
});
