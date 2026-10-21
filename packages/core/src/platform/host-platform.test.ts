/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { HostPlatform, createHostPlatform } from './host-platform';

const win = new HostPlatform({
  kind: 'win32',
  env: { Path: 'C:\\Windows;C:\\tools;', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
});
const lin = new HostPlatform({ kind: 'linux', env: { PATH: '/usr/bin:/opt/oh/bin' } });
const mac = new HostPlatform({ kind: 'darwin', arch: 'arm64' });

describe('HostPlatform (NFR-PLT-001, NFR-CMP-005)', () => {
  it.each([
    [win, 'hdc', 'exe', 'hdc.exe'],
    [win, 'hvigorw', 'script', 'hvigorw.bat'],
    [win, 'hdc.exe', 'exe', 'hdc.exe'],
    [lin, 'hdc', 'exe', 'hdc'],
    [mac, 'hvigorw', 'script', 'hvigorw'],
  ] as const)('exeName %#', (p, base, kind, expected) => {
    expect(p.exeName(base, kind)).toBe(expected);
  });

  it.each([
    ['c:/Users/张三/My Project/', 'C:\\Users\\张三\\My Project'],
    ['C:\\a\\..\\b\\.\\c', 'C:\\b\\c'],
    ['d:\\', 'D:\\'],
    ['\\\\?\\c:\\x\\y', '\\\\?\\C:\\x\\y'],
    ['\\\\server\\share\\dir', '\\\\server\\share\\dir'],
  ])('win32 normalize %j', (input, expected) => {
    expect(win.normalize(input)).toBe(expected);
  });

  it('win32 adds long path prefix beyond MAX_PATH', () => {
    const long = 'C:\\' + 'a'.repeat(300);
    expect(win.normalize(long)).toBe('\\\\?\\' + long);
  });

  it('posix normalize', () => {
    expect(lin.normalize('/a/b/../c//d')).toBe('/a/c/d');
  });

  it('device paths are always posix', () => {
    expect(win.toPosixDevicePath('tmp\\ohjs', 'a.hap')).toBe('/tmp/ohjs/a.hap');
    expect(lin.toPosixDevicePath('/storage/app/run', 'com.x', 'entry')).toBe('/storage/app/run/com.x/entry');
  });

  it('PATH lookup is case-insensitive on win32 only', () => {
    expect(win.pathEntries()).toEqual(['C:\\Windows', 'C:\\tools']);
    expect(lin.pathEntries()).toEqual(['/usr/bin', '/opt/oh/bin']);
    expect(lin.pathEntries({ Path: '/x' })).toEqual([]);
    expect(mac.pathEntries()).toEqual([]);
  });

  it('mergeEnv merges PATH/Path case-insensitively on win32', () => {
    const m = win.mergeEnv({ PATH: 'C:\\new' });
    expect(m['PATH']).toBe('C:\\new');
    expect(m['Path']).toBeUndefined();
    expect(m['LOCALAPPDATA']).toBeDefined();
    const l = lin.mergeEnv({ Path: '/x' }, { PATH: '/y', U: undefined });
    expect(l).toEqual({ PATH: '/y', Path: '/x' });
  });

  it('misc accessors', () => {
    expect(win.binKey).toBe('win32-x64');
    expect(mac.binKey).toBe('darwin-arm64');
    expect(win.pathDelimiter).toBe(';');
    expect(lin.pathDelimiter).toBe(':');
    expect(win.join('C:\\a', 'b')).toBe('C:\\a\\b');
    expect(win.dirname('C:\\a\\b.txt')).toBe('C:\\a');
    expect(win.isAbsolute('C:\\a')).toBe(true);
    expect(lin.isAbsolute('a/b')).toBe(false);
    expect(win.tempDir()).toBe('C:\\Windows\\Temp');
    expect(lin.tempDir()).toBe('/tmp');
    expect(lin.homeDir()).toBe('/home/user');
    expect(win.homeDir()).toBe('C:\\Users\\user');
  });

  it('createHostPlatform reflects the real host', () => {
    const h = createHostPlatform();
    expect(['win32', 'darwin', 'linux']).toContain(h.kind);
    expect(h.tempDir().length).toBeGreaterThan(0);
  });
});
