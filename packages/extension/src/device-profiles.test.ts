/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DeviceProfileRegistry, renderCommand } from '@ohjs/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_ID, builtinProfilesDir, loadProfilesFromDir } from './device-profiles';

const root = path.resolve(__dirname, '..');

describe('built-in device profiles (I-2, FR-PRJ-008)', () => {
  it('2k0300-1024x768 validates and resolves', () => {
    const reg = new DeviceProfileRegistry();
    expect(loadProfilesFromDir(reg, builtinProfilesDir(root), 'builtin')).toContain(DEFAULT_PROFILE_ID);
    const p = reg.resolve(DEFAULT_PROFILE_ID);
    expect(p.deviceType).toBe('smartVision');
    expect(p.display).toMatchObject({ width: 1024, height: 768 });
    expect(p.connection.tcpPort).toBe(8710);
    expect(p.paths.snapshotFlag).toBe('/data/ohjs/js_snapshot_enable');
    expect(renderCommand(p.commands.install, { hap: '/tmp/ohjs/a.hap' })).toBe(
      'bm install -p /tmp/ohjs/a.hap',
    );
    expect(p.features['FEATURE_ROTATION_API']).toBe(false);
  });

  it('user profiles in a directory extend the built-in one (multi-resolution)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-prof-'));
    fs.writeFileSync(
      path.join(dir, 'product-800x480.json'),
      JSON.stringify({
        id: 'product-800x480',
        extends: DEFAULT_PROFILE_ID,
        display: { width: 800, height: 480 },
      }),
    );
    fs.writeFileSync(path.join(dir, 'ignored.schema.json'), '{}');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    const reg = new DeviceProfileRegistry();
    loadProfilesFromDir(reg, builtinProfilesDir(root), 'builtin');
    expect(loadProfilesFromDir(reg, dir, 'project')).toEqual(['product-800x480']);
    const p = reg.resolve('product-800x480');
    expect(p.display).toMatchObject({ width: 800, height: 480, shape: 'rect' });
    expect(p.lineage).toEqual(['product-800x480', DEFAULT_PROFILE_ID]);
    expect(loadProfilesFromDir(reg, path.join(dir, 'missing'), 'user')).toEqual([]);
  });

  it('rejects an invalid profile file with its path in the message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-prof-'));
    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ id: 'Bad Id' }));
    expect(() => loadProfilesFromDir(new DeviceProfileRegistry(), dir, 'user')).toThrow(/bad\.json/);
  });
});
