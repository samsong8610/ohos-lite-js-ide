/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeProcessRunner, createHostPlatform, type IProcessRunner, type ProcessResult } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aceLoaderCloneStagingDir,
  aceLoaderProvisionRoot,
  defaultCloneSparseForTests,
  ensureAceLoaderInstall,
  isProvisionedAceLoaderReady,
  provisionAceLoader,
  renamePathWithRetry,
  resetAceLoaderProvisionLockForTests,
  rmPathWithRetry,
  setAceLoaderFsOpsForTests,
} from './ace-loader-provision';

const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

function okProcessResult(): ProcessResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    stdoutRaw: new Uint8Array(),
    stderrRaw: new Uint8Array(),
    durationMs: 0,
  };
}

function mockGitRunner(): IProcessRunner {
  return {
    run: async (spec) => {
      if (spec.args?.includes('clone')) {
        const outDir = spec.args[spec.args.length - 1] as string;
        const sub = path.join(outDir, 'ace-loader');
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, 'webpack.lite.config.js'), '// stub');
      }
      return okProcessResult();
    },
    spawnStream: () => {
      throw new Error('not used');
    },
    disposeAll: async () => {},
  };
}

describe('ace-loader provision', () => {
  const storageRoots: string[] = [];

  afterEach(() => {
    setAceLoaderFsOpsForTests(undefined);
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

describe('ace-loader clone fs (Windows EPERM mitigation)', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    setAceLoaderFsOpsForTests(undefined);
    for (const p of cleanup) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
    cleanup.length = 0;
  });

  it('aceLoaderCloneStagingDir lives under platform tempDir(), not beside destRoot', () => {
    const platform = createHostPlatform();
    const staging = aceLoaderCloneStagingDir(platform, 'OpenHarmony-v5.0.3-Release');
    expect(staging.startsWith(platform.tempDir())).toBe(true);
    expect(staging).not.toContain('.clone-tmp');
  });

  it('rmPathWithRetry succeeds after transient EPERM', async () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-rm-retry-'));
    cleanup.push(target);
    fs.writeFileSync(path.join(target, 'x'), '1');

    let epermHits = 0;
    setAceLoaderFsOpsForTests({
      existsSync: fs.existsSync,
      renameSync: fs.renameSync,
      rmSync(p, opts) {
        if (p === target && epermHits < 2) {
          epermHits++;
          const err = new Error('EPERM') as NodeJS.ErrnoException;
          err.code = 'EPERM';
          throw err;
        }
        return fs.rmSync(p, opts);
      },
    });

    await rmPathWithRetry(target, { maxAttempts: 5, delayMs: 1 });
    expect(epermHits).toBe(2);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('renamePathWithRetry succeeds after transient EPERM', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ren-retry-'));
    cleanup.push(dir);
    const from = path.join(dir, 'from');
    const to = path.join(dir, 'to');
    fs.mkdirSync(from);
    fs.writeFileSync(path.join(from, 'webpack.lite.config.js'), '// x');

    let epermHits = 0;
    setAceLoaderFsOpsForTests({
      existsSync: fs.existsSync,
      rmSync: fs.rmSync,
      renameSync(a, b) {
        if (a === from && b === to && epermHits < 2) {
          epermHits++;
          const err = new Error('EPERM') as NodeJS.ErrnoException;
          err.code = 'EPERM';
          throw err;
        }
        return fs.renameSync(a, b);
      },
    });

    await renamePathWithRetry(from, to, { maxAttempts: 5, delayMs: 1 });
    expect(epermHits).toBe(2);
    expect(fs.existsSync(path.join(to, 'webpack.lite.config.js'))).toBe(true);
  });

  it('defaultCloneSparse clones into TEMP and clears legacy .clone-tmp under destRoot', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-store-'));
    cleanup.push(storageRoot);
    const destRoot = aceLoaderProvisionRoot(storageRoot);
    const legacyTmp = `${destRoot}.clone-tmp`;
    fs.mkdirSync(legacyTmp, { recursive: true });
    fs.writeFileSync(path.join(legacyTmp, 'stale.txt'), 'leftover');

    let cloneOutDir = '';
    const runner: IProcessRunner = {
      run: async (spec) => {
        if (spec.args?.includes('clone')) {
          cloneOutDir = spec.args[spec.args.length - 1] as string;
          const sub = path.join(cloneOutDir, 'ace-loader');
          fs.mkdirSync(sub, { recursive: true });
          fs.writeFileSync(path.join(sub, 'webpack.lite.config.js'), '// stub');
        }
        return okProcessResult();
      },
      spawnStream: () => {
        throw new Error('not used');
      },
      disposeAll: async () => {},
    };

    await defaultCloneSparseForTests(createHostPlatform(), runner, {
      repoUrl: 'https://example.invalid/repo.git',
      tag: 'OpenHarmony-v5.0.3-Release',
      subdir: 'ace-loader',
      destRoot,
    });

    expect(cloneOutDir.startsWith(createHostPlatform().tempDir())).toBe(true);
    expect(cloneOutDir).not.toBe(legacyTmp);
    expect(fs.existsSync(legacyTmp)).toBe(false);
    expect(fs.existsSync(path.join(destRoot, 'webpack.lite.config.js'))).toBe(true);
    expect(fs.existsSync(cloneOutDir)).toBe(false);
  });

  it('defaultCloneSparse retries rm of destRoot when EPERM is transient', async () => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-ace-store-'));
    cleanup.push(storageRoot);
    const destRoot = aceLoaderProvisionRoot(storageRoot);
    fs.mkdirSync(destRoot, { recursive: true });
    fs.writeFileSync(path.join(destRoot, 'partial.txt'), 'old');

    let destRmEperm = 0;
    setAceLoaderFsOpsForTests({
      existsSync: fs.existsSync,
      renameSync: fs.renameSync,
      rmSync(p, opts) {
        if (p === destRoot && destRmEperm < 1) {
          destRmEperm++;
          const err = new Error('EPERM') as NodeJS.ErrnoException;
          err.code = 'EPERM';
          throw err;
        }
        return fs.rmSync(p, opts);
      },
    });

    await defaultCloneSparseForTests(createHostPlatform(), mockGitRunner(), {
      repoUrl: 'https://example.invalid/repo.git',
      tag: 'OpenHarmony-v5.0.3-Release',
      subdir: 'ace-loader',
      destRoot,
    });

    expect(destRmEperm).toBe(1);
    expect(fs.existsSync(path.join(destRoot, 'webpack.lite.config.js'))).toBe(true);
    expect(fs.existsSync(path.join(destRoot, 'partial.txt'))).toBe(false);
  });
});
