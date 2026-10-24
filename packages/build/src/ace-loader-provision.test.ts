/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aceLoaderProvisionRoot,
  ensureAceLoaderInstall,
  isProvisionedAceLoaderReady,
  provisionAceLoader,
  resetAceLoaderProvisionLockForTests,
} from './ace-loader-provision';

const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

describe('ace-loader provision', () => {
  const storageRoots: string[] = [];

  afterEach(() => {
    resetAceLoaderProvisionLockForTests();
    for (const d of storageRoots) fs.rmSync(d, { recursive: true, force: true });
    storageRoots.length = 0;
  });

  it('isProvisionedAceLoaderReady is true for fake fixture root', () => {
    expect(isProvisionedAceLoaderReady(fakeAceRoot)).toBe(true);
  });

  it('ensureAceLoaderInstall uses existing provision dir without network', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-store-'));
    storageRoots.push(storageRoot);
    const dest = aceLoaderProvisionRoot(storageRoot);
    fs.cpSync(fakeAceRoot, dest, { recursive: true });

    const runner = new NodeProcessRunner(createHostPlatform());
    const install = await ensureAceLoaderInstall(createHostPlatform(), runner, {
      workspaceRoot: '/tmp/ws',
      storageRoot,
      provision: true,
    });
    runner.disposeAll();
    expect(install?.root).toBe(dest);
  });

  it('provisionAceLoader can use injected clone/npm hooks', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-store-'));
    storageRoots.push(storageRoot);
    const dest = aceLoaderProvisionRoot(storageRoot);
    const runner = new NodeProcessRunner(createHostPlatform());

    await provisionAceLoader(createHostPlatform(), runner, storageRoot, undefined, {
      cloneSparse: async () => {
        fs.mkdirSync(dest, { recursive: true });
        fs.cpSync(fakeAceRoot, dest, { recursive: true });
      },
      npmInstall: async () => {
        /* fixture already has stub-webpack.js */
      },
    });
    runner.disposeAll();

    expect(fs.existsSync(path.join(dest, 'webpack.lite.config.js'))).toBe(true);
    expect(isProvisionedAceLoaderReady(dest)).toBe(true);
  });

  it('does not provision when manual aceLoaderPath is set', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-store-'));
    storageRoots.push(storageRoot);
    const runner = new NodeProcessRunner(createHostPlatform());
    let cloned = false;
    const install = await ensureAceLoaderInstall(createHostPlatform(), runner, {
      workspaceRoot: '/tmp/ws',
      aceLoaderPath: '/nonexistent/manual',
      storageRoot,
      provision: true,
      deps: {
        cloneSparse: async () => {
          cloned = true;
        },
      },
    });
    runner.disposeAll();
    expect(cloned).toBe(false);
    expect(install).toBeUndefined();
  });
});
