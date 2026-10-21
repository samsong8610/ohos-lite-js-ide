/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { isOhjsError } from '../errors';
import { HostPlatform, createHostPlatform } from './host-platform';
import { NodeProcessRunner } from './process-runner';
import { ToolLocator } from './tool-locator';

const win = new HostPlatform({
  kind: 'win32',
  env: { Path: 'C:\\bin;C:\\tools', LOCALAPPDATA: 'C:\\L' },
  homeDir: 'C:\\Users\\u',
});
const lin = new HostPlatform({ kind: 'linux', env: { PATH: '/usr/bin' }, homeDir: '/home/u' });

const existsIn = (set: string[]) => (p: string) => set.includes(p);

describe('ToolLocator (NFR-PLT-002, NFR-DST-004)', () => {
  it('orders candidates user > project > PATH > bundled > default', () => {
    const l = new ToolLocator(win, () => false);
    const c = l.candidates('hdc', { user: 'U\\hdc.exe', project: 'P\\hdc.exe', extensionDir: 'C:\\ext' });
    expect(c.map((x) => x.source)).toEqual([
      'user',
      'project',
      'path',
      'path',
      'bundled',
      'default',
      'default',
    ]);
    expect(c[4]!.path).toBe('C:\\ext\\bin\\win32-x64\\hdc.exe');
    expect(c[5]!.path).toBe('C:\\L\\Huawei\\Sdk\\openharmony\\toolchains\\hdc.exe');
  });

  it('finds .bat and .cmd scripts on PATH on win32', () => {
    const l = new ToolLocator(win, existsIn(['C:\\tools\\hvigorw.cmd']));
    expect(l.locate('hvigorw')).toEqual({ tool: 'hvigorw', path: 'C:\\tools\\hvigorw.cmd', source: 'path' });
  });

  it.each([
    [['/usr/bin/hdc'], 'path'],
    [['/ext/bin/linux-x64/hdc'], 'bundled'],
    [['/home/u/OpenHarmony/Sdk/toolchains/hdc'], 'default'],
    [['/p/hdc', '/usr/bin/hdc'], 'project'],
  ])('picks the first existing candidate %#', (existing, source) => {
    const l = new ToolLocator(lin, existsIn(existing));
    expect(l.locate('hdc', { project: '/p/hdc', extensionDir: '/ext' }).source).toBe(source);
  });

  it('configured user path that does not exist is an error', () => {
    const l = new ToolLocator(lin, existsIn(['/usr/bin/hdc']));
    try {
      l.locate('hdc', { user: '/wrong/hdc' });
      expect.unreachable();
    } catch (e) {
      expect(isOhjsError(e, 'ENV-HDC-NOT-FOUND')).toBe(true);
    }
    expect(() => l.locate('node', { user: '/wrong/node' })).toThrow(/configured path/);
  });

  it('reports every tried path when nothing is found', () => {
    const l = new ToolLocator(lin, () => false);
    try {
      l.locate('jerry-snapshot');
      expect.unreachable();
    } catch (e) {
      expect(isOhjsError(e, 'ENV-TOOL-NOT-FOUND')).toBe(true);
      expect((e as { detail: { raw: string; hint: string } }).detail.raw).toContain(
        '/usr/bin/jerry-snapshot',
      );
      expect((e as { detail: { hint: string } }).detail.hint).toContain('jerrySnapshotPath');
    }
    expect(() => l.locate('hdc')).toThrow(/hdc not found/);
  });

  it('default dirs for every tool/platform', () => {
    expect(new ToolLocator(win).defaultDirs('hvigorw')[0]).toContain('DevEco Studio');
    expect(new ToolLocator(win).defaultDirs('node')).toEqual([]);
    expect(new ToolLocator(lin).defaultDirs('hvigorw')).toEqual(['/home/u/OpenHarmony/hvigor/bin']);
    expect(new ToolLocator(lin).defaultDirs('node')).toEqual([]);
    const noLocal = new HostPlatform({ kind: 'win32', homeDir: 'C:\\Users\\x' });
    expect(new ToolLocator(noLocal).defaultDirs('hdc')[0]).toBe(
      'C:\\Users\\x\\AppData\\Local\\Huawei\\Sdk\\openharmony\\toolchains',
    );
  });

  it('default exists() checks real files and probes versions', async () => {
    const host = createHostPlatform();
    const l = new ToolLocator(host);
    const located = l.locate('node', { user: process.execPath });
    expect(located.source).toBe('user');
    expect(await l.probeVersion(located, new NodeProcessRunner(host))).toBe(process.versions.node);
    expect(() => l.locate('node', { user: '/' })).toThrow();
  });
});
