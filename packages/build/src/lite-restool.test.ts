/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRestoolPath } from './lite-restool';

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
});
