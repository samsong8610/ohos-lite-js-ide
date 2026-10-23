/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHostPlatform, type CommandSpec, type IProcessRunner, type ProcessResult } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAceLoaderInstall } from './ace-loader-config';
import { aceLoaderWebpackEnv, runAceLoaderBuild, webpackLiteCommand } from './ace-loader-backend';
import { buildProject, parseFaConfigJson } from './index';

const fixtureRoot = path.join(__dirname, '../../extension/test/fixtures/oh-project');
const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

class RecordingRunner implements IProcessRunner {
  readonly calls: CommandSpec[] = [];
  async run(cmd: CommandSpec): Promise<ProcessResult> {
    this.calls.push(cmd);
    return {
      exitCode: 0,
      signal: null,
      stdout: 'ok',
      stderr: '',
      stdoutRaw: new Uint8Array(),
      stderrRaw: new Uint8Array(),
      durationMs: 1,
    };
  }
  spawnStream(): never {
    throw new Error('not used');
  }
  async disposeAll(): Promise<void> {}
}

describe('ace-loader backend', () => {
  const outDirs: string[] = [];

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

  it('runAceLoaderBuild packs FA hap with mocked webpack', async () => {
    const platform = createHostPlatform();
    const runner = new RecordingRunner();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-'));
    outDirs.push(outDir);
    const cfg = path.join(fixtureRoot, 'entry/src/main/config.json');
    const module = parseFaConfigJson(fs.readFileSync(cfg, 'utf8'), cfg);

    const r = await runAceLoaderBuild(platform, runner, module, {
      workspaceRoot: fixtureRoot,
      aceLoaderPath: fakeAceRoot,
      outDir,
    });
    expect(runner.calls.length).toBe(1);
    expect(r.backend).toBe('ace-loader');
    expect(fs.existsSync(r.hapPath)).toBe(true);
  });

  it('buildProject uses fake ace-loader end-to-end', async () => {
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-e2e-'));
    outDirs.push(outDir);
    const r = await buildProject(platform, runner, {
      workspaceRoot: fixtureRoot,
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
    const platform = createHostPlatform();
    const { NodeProcessRunner } = await import('@ohjs/core');
    const runner = new NodeProcessRunner(platform);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-real-'));
    const r = await buildProject(platform, runner, {
      workspaceRoot: fixtureRoot,
      outDir,
      backend: 'ace-loader',
      aceLoaderMain: main,
    });
    expect(r.backend).toBe('ace-loader');
    expect(fs.existsSync(r.hapPath)).toBe(true);
    fs.rmSync(outDir, { recursive: true, force: true });
    runner.disposeAll();
  });
});
