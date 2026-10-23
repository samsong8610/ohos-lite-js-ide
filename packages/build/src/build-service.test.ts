/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProject, findConfigJson, parseFaConfigJson } from './index';

const fixtureRoot = path.join(__dirname, '../../extension/test/fixtures/oh-project');

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
});
