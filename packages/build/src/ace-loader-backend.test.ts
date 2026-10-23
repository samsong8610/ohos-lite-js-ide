/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHostPlatform } from '@ohjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resolveAceLoaderInstall } from './ace-loader-config';
import { aceLoaderWebpackEnv, runAceLoaderBuild, webpackLiteCommand } from './ace-loader-backend';
import { buildProject, parseFaConfigJson } from './index';

const fixtureRoot = path.join(__dirname, '../../extension/test/fixtures/oh-project');
const helloliteFixtureRoot = path.join(__dirname, '../test/fixtures/hellolite-lite');
const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

function copyHelloliteWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-hellolite-'));
  fs.cpSync(helloliteFixtureRoot, root, { recursive: true });
  return root;
}

const restoolShim = path.join(__dirname, '../test/fixtures/restool-shim/restool.cjs');

describe('ace-loader backend', () => {
  const outDirs: string[] = [];
  let prevRestool: string | undefined;

  beforeAll(() => {
    prevRestool = process.env.OHJS_RESTOOL;
    process.env.OHJS_RESTOOL = restoolShim;
  });

  afterAll(() => {
    if (prevRestool === undefined) delete process.env.OHJS_RESTOOL;
    else process.env.OHJS_RESTOOL = prevRestool;
  });

  afterEach(() => {
    for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true });
    outDirs.length = 0;
  });

  it('resolveAceLoaderInstall finds fake fixture root', () => {
    const install = resolveAceLoaderInstall({
      workspaceRoot: fixtureRoot,
      aceLoaderPath: fakeAceRoot,
    });
    expect(install?.webpackConfig).toMatch(/webpack\.lite\.config\.js$/);
    expect(install?.webpackCli).toMatch(/webpack\.js$/);
    expect(fs.existsSync(install!.webpackCli)).toBe(true);
  });

  it('webpackLiteCommand passes webpack config and buildMode env', () => {
    const platform = createHostPlatform();
    const install = resolveAceLoaderInstall({ workspaceRoot: fixtureRoot, aceLoaderPath: fakeAceRoot })!;
    const env = aceLoaderWebpackEnv(platform, {
      aceModuleRoot: '/proj/js/default',
      aceModuleBuild: '/out/js',
      aceManifestPath: '/proj/js/default/manifest.json',
      buildMode: 'debug',
      deviceType: 'smartVision',
      baseEnv: {},
    });
    const cmd = webpackLiteCommand(platform, install, env, 'debug');
    expect(cmd.args).toContain('--config');
    expect(cmd.args).toContain(install.webpackConfig);
    expect(cmd.env?.DEVICE_LEVEL).toBe('lite');
    expect(cmd.env?.DEVICE_TYPE).toBe('smartVision');
    expect(cmd.env?.aceModuleRoot).toBe('/proj/js/default');
    expect(cmd.env?.aceModuleBuild).toBe('/out/js');
    expect(cmd.env?.buildMode).toBe('debug');
  });

  it('runAceLoaderBuild packs FA hap with fake webpack + restool shim', async () => {
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
    const helloliteRoot = copyHelloliteWorkspace();
    outDirs.push(helloliteRoot);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-'));
    outDirs.push(outDir);
    const cfg = path.join(helloliteRoot, 'entry/src/main/config.json');
    const module = parseFaConfigJson(fs.readFileSync(cfg, 'utf8'), cfg);

    const r = await runAceLoaderBuild(platform, runner, module, {
      workspaceRoot: helloliteRoot,
      aceLoaderPath: fakeAceRoot,
      outDir,
    });
    expect(r.backend).toBe('ace-loader');
    expect(fs.existsSync(r.hapPath)).toBe(true);
    runner.disposeAll();
  });

  it('buildProject uses fake ace-loader end-to-end', async () => {
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
    const helloliteRoot = copyHelloliteWorkspace();
    outDirs.push(helloliteRoot);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-e2e-'));
    outDirs.push(outDir);
    const r = await buildProject(platform, runner, {
      workspaceRoot: helloliteRoot,
      outDir,
      backend: 'ace-loader',
      aceLoaderPath: fakeAceRoot,
    });
    expect(r.backend).toBe('ace-loader');
    runner.disposeAll();
  });
});

describe('ace-loader integration (optional)', () => {
  const main = process.env.OHJS_ACE_LOADER_MAIN;
  const itIf = main ? it : it.skip;

  itIf('builds with real OHJS_ACE_LOADER_MAIN', async () => {
    const prevRestool = process.env.OHJS_RESTOOL;
    if (!prevRestool) {
      process.env.OHJS_RESTOOL = restoolShim;
    }
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
    const helloliteRoot = copyHelloliteWorkspace();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-real-'));
    const r = await buildProject(platform, runner, {
      workspaceRoot: helloliteRoot,
      outDir,
      backend: 'ace-loader',
      aceLoaderMain: main,
    });
    expect(r.backend).toBe('ace-loader');
    expect(fs.existsSync(r.hapPath)).toBe(true);
    fs.rmSync(outDir, { recursive: true, force: true });
    runner.disposeAll();
    if (!prevRestool) delete process.env.OHJS_RESTOOL;
  });
});
