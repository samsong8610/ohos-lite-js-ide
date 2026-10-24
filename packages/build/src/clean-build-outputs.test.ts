/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanBuildOutputs, listCleanBuildOutputPaths } from './clean-build-outputs';

const fixtureRoot = path.join(__dirname, '../../extension/test/fixtures/oh-project');

describe('cleanBuildOutputs', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const d of tempRoots) fs.rmSync(d, { recursive: true, force: true });
    tempRoots.length = 0;
  });

  it('lists .ohjs/build and module build/ for known fixture', () => {
    const listed = listCleanBuildOutputPaths(fixtureRoot);
    expect(listed).toContain(path.join(fixtureRoot, '.ohjs', 'build'));
    expect(listed.some((p) => p.endsWith(`${path.sep}entry${path.sep}build`))).toBe(true);
  });

  it('removes only build intermediates and leaves sources', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-clean-'));
    tempRoots.push(root);
    fs.cpSync(fixtureRoot, root, { recursive: true });
    const ohjsBuild = path.join(root, '.ohjs', 'build', 'staging');
    const entryBuild = path.join(root, 'entry', 'build', 'default');
    fs.mkdirSync(ohjsBuild, { recursive: true });
    fs.mkdirSync(entryBuild, { recursive: true });
    fs.writeFileSync(path.join(ohjsBuild, 'artifact.txt'), 'x');
    fs.writeFileSync(path.join(entryBuild, 'out.hap'), 'hap');
    const srcJs = path.join(root, 'entry', 'src', 'main', 'js', 'default', 'pages', 'index', 'index.js');
    expect(fs.existsSync(srcJs)).toBe(true);

    const { removed } = cleanBuildOutputs(root);
    expect(removed).toContain(path.join(root, '.ohjs', 'build'));
    expect(removed).toContain(path.join(root, 'entry', 'build'));
    expect(fs.existsSync(srcJs)).toBe(true);
    expect(fs.existsSync(path.join(root, '.ohjs', 'project.json'))).toBe(true);

    const again = cleanBuildOutputs(root);
    expect(again.removed).toEqual([]);
  });
});
