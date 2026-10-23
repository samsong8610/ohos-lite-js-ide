/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeProcessRunner, createHostPlatform, isOhjsError } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProject, findConfigJson, parseFaConfigJson } from './index';

const fixtureRoot = path.join(__dirname, '../../extension/test/fixtures/oh-project');
const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

describe('buildProject (fixture backend)', () => {
  const outDirs: string[] = [];

  afterEach(() => {
    for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true });
    outDirs.length = 0;
  });

  it('finds config and produces .hap', async () => {
    const cfg = findConfigJson(fixtureRoot);
    expect(cfg).toMatch(/config\.json$/);
    const info = parseFaConfigJson(fs.readFileSync(cfg!, 'utf8'), cfg!);
    expect(info.bundleName).toBe('com.example.ohjs.smoke');

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-bld-'));
    outDirs.push(outDir);
    const runner = new NodeProcessRunner(createHostPlatform());
    const r = await buildProject(createHostPlatform(), runner, {
      workspaceRoot: fixtureRoot,
      outDir,
      backend: 'fixture',
    });
    expect(r.backend).toBe('fixture');
    expect(fs.existsSync(r.hapPath)).toBe(true);
    expect(r.hapPath.endsWith('.hap')).toBe(true);
    runner.disposeAll();
  });

  it('throws BLD-TOOL-MISSING when ace-loader backend has no install', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-bld-'));
    outDirs.push(outDir);
    const runner = new NodeProcessRunner(createHostPlatform());
    await expect(
      buildProject(createHostPlatform(), runner, {
        workspaceRoot: fixtureRoot,
        outDir,
        backend: 'ace-loader',
        aceLoaderPath: '/nonexistent/ace-loader',
      }),
    ).rejects.toSatisfy((e) => isOhjsError(e, 'BLD-TOOL-MISSING'));
    runner.disposeAll();
  });

  it('auto uses fake ace-loader when path is set', async () => {
    const prevRestool = process.env.OHJS_RESTOOL;
    process.env.OHJS_RESTOOL = path.join(__dirname, '../test/fixtures/restool-shim/restool.cjs');
    const helloliteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-hellolite-'));
    fs.cpSync(path.join(__dirname, '../test/fixtures/hellolite-lite'), helloliteRoot, { recursive: true });
    outDirs.push(helloliteRoot);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-bld-'));
    outDirs.push(outDir);
    const runner = new NodeProcessRunner(createHostPlatform());
    try {
      const r = await buildProject(createHostPlatform(), runner, {
        workspaceRoot: helloliteRoot,
        outDir,
        backend: 'auto',
        aceLoaderPath: fakeAceRoot,
      });
      expect(r.backend).toBe('ace-loader');
    } finally {
      if (prevRestool === undefined) delete process.env.OHJS_RESTOOL;
      else process.env.OHJS_RESTOOL = prevRestool;
      runner.disposeAll();
    }
  });
});
