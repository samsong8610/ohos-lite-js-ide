/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeProcessRunner, createHostPlatform, renderProjectTemplate } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProject, findConfigJson } from './index';

const templatesRoot = path.resolve(__dirname, '../../../templates');

describe('wizard scaffold (fixture build)', () => {
  const outDirs: string[] = [];

  afterEach(() => {
    for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true });
    outDirs.length = 0;
  });

  it('generated empty project builds with fixture backend', async () => {
    const files = renderProjectTemplate(templatesRoot, 'empty', {
      bundleName: 'com.example.buildtest',
      vendor: 'example',
      sdkVersion: '6.1-lts',
      deviceProfileId: '2k0300-1024x768',
      display: { width: 1024, height: 768 },
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-wiz-'));
    outDirs.push(root);
    for (const f of files) {
      const dest = path.join(root, f.relativePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
    }
    expect(findConfigJson(root)).toBeTruthy();
    const outDir = path.join(root, '.ohjs', 'build');
    fs.mkdirSync(outDir, { recursive: true });
    const runner = new NodeProcessRunner(createHostPlatform());
    const r = await buildProject(createHostPlatform(), runner, {
      workspaceRoot: root,
      outDir,
      backend: 'fixture',
    });
    expect(fs.existsSync(r.hapPath)).toBe(true);
    runner.disposeAll();
  });
});
