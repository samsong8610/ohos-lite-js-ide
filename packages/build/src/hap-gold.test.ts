/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHostPlatform } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProject } from './build-service';
import { devecoHapOutputPath } from './hap-paths';
import { parseFaConfigJson } from './project-info';

const helloliteRoot = path.join(__dirname, '../test/fixtures/hellolite-lite');
const goldHap = path.join(__dirname, '../test/fixtures/gold-hap/entry-default.gold.hap');
const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

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

function listZipPaths(hapPath: string): string[] {
  const out = execFileSync('unzip', ['-Z1', hapPath], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function readZipJson(hapPath: string, entry: string): unknown {
  const out = execFileSync('unzip', ['-p', hapPath, entry], { encoding: 'utf8' });
  return JSON.parse(out);
}

describe('HAP gold acceptance (DevEco 3.1 Lite JS)', () => {
  const outDirs: string[] = [];

  afterEach(() => {
    for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true });
    outDirs.length = 0;
  });

  it('gold reference hap contains expected path set', () => {
    const paths = listZipPaths(goldHap);
    for (const p of GOLD_HAP_PATHS) {
      expect(paths, `gold missing ${p}`).toContain(p);
    }
  });

  it('ace-loader build of hellolite-lite matches gold paths and key config/pack fields', async () => {
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
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
    for (const p of GOLD_HAP_PATHS) {
      expect(builtPaths, `built hap missing ${p}`).toContain(p);
    }

    const goldPaths = listZipPaths(goldHap);
    expect(builtPaths.sort()).toEqual(goldPaths.sort());

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

    runner.disposeAll();
  });
});
