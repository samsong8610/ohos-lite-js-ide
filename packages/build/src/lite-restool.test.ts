/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostPlatform, createHostPlatform } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveExistingRestoolCandidate, resolveRestoolPath } from './lite-restool';

const win32 = new HostPlatform({ kind: 'win32' });
const linux = new HostPlatform({ kind: 'linux' });
const host = createHostPlatform();

describe('resolveRestoolPath', () => {
  let tmpDir: string | undefined;
  const prev = process.env.OHJS_RESTOOL;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
    if (prev === undefined) delete process.env.OHJS_RESTOOL;
    else process.env.OHJS_RESTOOL = prev;
  });

  it('prefers setting over env when both exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const fromSetting = path.join(tmpDir, 'setting-restool');
    const fromEnv = path.join(tmpDir, 'env-restool');
    fs.writeFileSync(fromSetting, '');
    fs.writeFileSync(fromEnv, '');
    process.env.OHJS_RESTOOL = fromEnv;
    expect(resolveRestoolPath({ restoolPath: fromSetting })).toBe(fromSetting);
  });

  it('falls back to env when setting is empty', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const fromEnv = path.join(tmpDir, 'env-restool');
    fs.writeFileSync(fromEnv, '');
    process.env.OHJS_RESTOOL = fromEnv;
    expect(resolveRestoolPath({})).toBe(fromEnv);
  });

  it('on win32 appends .exe when configured bare path is missing', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const bare = path.join(tmpDir, 'restool');
    const withExe = `${bare}.exe`;
    fs.writeFileSync(withExe, '');
    expect(resolveExistingRestoolCandidate(bare, win32)).toBe(withExe);
  });

  it('on win32 strips .exe when only bare binary exists', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const bare = path.join(tmpDir, 'restool');
    fs.writeFileSync(bare, '');
    expect(resolveExistingRestoolCandidate(`${bare}.exe`, win32)).toBe(bare);
  });

  it('does not append .exe when platform kind is not win32', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const bare = path.join(tmpDir, 'restool');
    fs.writeFileSync(`${bare}.exe`, '');
    expect(resolveExistingRestoolCandidate(bare, linux)).toBeUndefined();
  });

  it.runIf(host.kind === 'win32')('resolveRestoolPath on win32 host appends .exe', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const bare = path.join(tmpDir, 'restool');
    const withExe = `${bare}.exe`;
    fs.writeFileSync(withExe, '');
    expect(resolveRestoolPath({ restoolPath: bare })).toBe(withExe);
  });

  it.runIf(host.kind !== 'win32')('resolveRestoolPath on non-win32 host ignores .exe-only sibling', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-restool-'));
    const bare = path.join(tmpDir, 'restool');
    fs.writeFileSync(`${bare}.exe`, '');
    expect(resolveRestoolPath({ restoolPath: bare })).toBeUndefined();
  });
});
