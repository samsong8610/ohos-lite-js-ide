/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { isOhjsError } from '../../errors';
import {
  DEVICE_PROFILE_JSON_SCHEMA,
  DeviceProfileRegistry,
  deepMerge,
  fileSendTimeoutMs,
  parseDeviceProfile,
  quoteDeviceShell,
  renderCommand,
  selectProfiles,
  templatePlaceholders,
  validateProfileInput,
  type DeviceProfileInput,
} from './index';

const base: DeviceProfileInput = {
  id: 'base',
  arch: 'loongarch64',
  kernel: 'linux',
  deviceType: 'smartVision',
  display: { width: 1024, height: 768, shape: 'rect' },
  connection: { preferred: 'usb', fallback: ['tcp'], tcpPort: 8710 },
  paths: {
    tmpDir: '/tmp/ohjs',
    snapshotFlag: '/data/ohjs/js_snapshot_enable',
    appInstallRoot: '/storage/app/run',
  },
  commands: {
    install: 'bm install -p {hap}',
    uninstall: 'bm uninstall -n {bundle}',
    list: 'bm dump -l',
    start: 'aa start -p {bundle} -n {ability}',
    stop: 'aa terminate -p {bundle}',
    log: 'hilogcat -L {level}',
    disableSignCheck: 'bm set -s disable',
    setSnapshotMode: 'touch {snapshotFlag}',
    setJsMode: 'rm -f {snapshotFlag}',
    checkMode: 'ls {snapshotFlag}',
    mkTmp: 'mkdir -p {tmpDir}',
  },
  debug: { port: 5001 },
  features: { FEATURE_ROTATION_API: false },
};

describe('templates', () => {
  it('lists placeholders, ignoring escaped braces', () => {
    expect(templatePlaceholders('a {x} {{lit}} {y} {x}')).toEqual(['x', 'y']);
  });
  it.each([
    ['plain', 'plain'],
    ['/tmp/ohjs/a.hap', '/tmp/ohjs/a.hap'],
    ['a b', "'a b'"],
    ["it's", "'it'\\''s'"],
    ['', "''"],
    ['$(rm -rf /)', "'$(rm -rf /)'"],
    ['中文', "'中文'"],
  ])('quoteDeviceShell(%j)', (v, q) => expect(quoteDeviceShell(v)).toBe(q));
  it('renders commands with quoting and literal braces', () => {
    expect(
      renderCommand('aa start -p {bundle} -n {ability}', { bundle: 'com.x.y', ability: 'default' }),
    ).toBe('aa start -p com.x.y -n default');
    expect(renderCommand('echo {{x}} {n}', { n: 5 })).toBe('echo {x} 5');
    expect(renderCommand('ls {p}', { p: '/a b' })).toBe("ls '/a b'");
  });
  it('fails on missing variables', () => {
    try {
      renderCommand('bm install -p {hap}', {});
      expect.unreachable();
    } catch (e) {
      expect(isOhjsError(e, 'PRJ-PROFILE-TEMPLATE-VAR')).toBe(true);
    }
  });
});

describe('validation (JSON schema + semantics)', () => {
  it('accepts a complete profile', () => {
    expect(validateProfileInput(base)).toEqual([]);
  });
  it.each([
    [{ id: 'Bad Id' }, '/id'],
    [{ id: 'x', deviceType: 'SmartVision' }, '/deviceType'],
    [{ id: 'x', display: { width: 0 } }, '/display/width'],
    [{ id: 'x', connection: { preferred: 'uart' } }, '/connection/preferred'],
    [{ id: 'x', connection: { tcpPort: 70000 } }, '/connection/tcpPort'],
    [{ id: 'x', paths: { tmpDir: 'relative/dir' } }, '/paths/tmpDir'],
    [{ id: 'x', features: { lower_case: true } }, '/features'],
    [{ id: 'x', bogus: 1 }, '/'],
    [{ id: 'x', commands: { install: 'bm install -p {file}' } }, '/commands/install'],
    [{ id: 'x', commands: { list: 'bm dump -l {bundle}' } }, '/commands/list'],
    [{ id: 'x', connection: { preferred: 'tcp', fallback: ['tcp'] } }, '/connection/fallback'],
  ])('rejects %j at %s', (input, path) => {
    const issues = validateProfileInput(input);
    expect(issues.map((i) => i.path)).toContain(path);
  });
  it('reports unknown properties by name', () => {
    expect(validateProfileInput({ id: 'x', bogus: 1 })[0]!.message).toBe('unknown property "bogus"');
  });
  it('parseDeviceProfile throws PRJ-PROFILE-INVALID with all issues', () => {
    expect(() => parseDeviceProfile('{', 'f.json')).toThrow(/f\.json: invalid JSON/);
    try {
      parseDeviceProfile(JSON.stringify({ id: 'x', display: { width: -1 }, deviceType: 'tv' }), 'p.json');
      expect.unreachable();
    } catch (e) {
      expect(isOhjsError(e, 'PRJ-PROFILE-INVALID')).toBe(true);
      expect((e as Error).message).toMatch(/display\/width/);
      expect((e as Error).message).toMatch(/deviceType/);
    }
    expect(parseDeviceProfile(JSON.stringify(base)).id).toBe('base');
  });
  it('schema is draft-07 and lists every command key', () => {
    expect(DEVICE_PROFILE_JSON_SCHEMA.$schema).toContain('draft-07');
    expect(Object.keys(DEVICE_PROFILE_JSON_SCHEMA.properties.commands.properties)).toContain('install');
  });
});

describe('DeviceProfileRegistry', () => {
  const make = (): DeviceProfileRegistry => {
    const r = new DeviceProfileRegistry();
    r.add(base, 'builtin');
    r.add(
      { id: 'p-800x480', extends: 'base', name: 'Product', display: { width: 800, height: 480 } },
      'builtin',
    );
    r.add({
      id: 'p-round',
      extends: 'p-800x480',
      display: { shape: 'round' },
      connection: { preferred: 'tcp' },
    });
    return r;
  };

  it('resolves extends chains with deep merge', () => {
    const p = make().resolve('p-round');
    expect(p.display).toEqual({ width: 800, height: 480, shape: 'round' });
    expect(p.lineage).toEqual(['p-round', 'p-800x480', 'base']);
    expect(p.name).toBe('Product');
    // preferred=tcp removes tcp from inherited fallback
    expect(p.connection).toMatchObject({ preferred: 'tcp', fallback: [] });
    expect(p.timeouts.shellMs).toBe(30000);
    expect(p.jerry).toEqual({});
  });

  it('applies settings overrides last', () => {
    const p = make().resolve('base', {
      display: { width: 640, height: 480 },
      paths: { tmpDir: '/data/tmp' },
    });
    expect(p.display).toEqual({ width: 640, height: 480, shape: 'rect' });
    expect(p.paths.tmpDir).toBe('/data/tmp');
    expect(p.paths.snapshotFlag).toBe('/data/ohjs/js_snapshot_enable');
    expect(p.name).toBe('base');
  });

  it('lists profiles with origin', () => {
    expect(
      make()
        .list()
        .map((x) => `${x.id}:${x.origin}`),
    ).toEqual(['base:builtin', 'p-800x480:builtin', 'p-round:user']);
  });

  it('project profiles shadow built-ins, not vice versa', () => {
    const r = make();
    r.add({ ...base, name: 'project copy' }, 'project');
    r.add({ ...base, name: 'late builtin' }, 'builtin');
    expect(r.resolve('base').name).toBe('project copy');
    expect(r.has('base')).toBe(true);
    expect(r.has('nope')).toBe(false);
  });

  it.each([
    ['missing', /not found/, 'PRJ-PROFILE-NOT-FOUND'],
    ['orphan', /extends unknown profile "ghost"/, 'PRJ-PROFILE-NOT-FOUND'],
    ['a', /cycle: a → b → a/, 'PRJ-PROFILE-CYCLE'],
    ['partial', /missing: arch/, 'PRJ-PROFILE-INVALID'],
  ] as const)('error: %s', (id, msg, code) => {
    const r = make();
    r.add({ id: 'orphan', extends: 'ghost' });
    r.add({ id: 'a', extends: 'b' });
    r.add({ id: 'b', extends: 'a' });
    r.add({ id: 'partial', display: { width: 1 } });
    try {
      r.resolve(id);
      expect.unreachable();
    } catch (e) {
      expect(isOhjsError(e, code)).toBe(true);
      expect((e as Error).message).toMatch(msg);
    }
  });

  it('rejects invalid input on add', () => {
    expect(() => new DeviceProfileRegistry().add({ id: 'x', deviceType: 'tv' } as never)).toThrow(
      /invalid device profile/,
    );
  });
});

describe('helpers', () => {
  it('deepMerge replaces arrays and scalars, merges objects', () => {
    expect(deepMerge({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] }, d: undefined, e: 2 })).toEqual({
      a: { b: 1, c: [3] },
      d: 1,
      e: 2,
    });
    expect(deepMerge(1, undefined)).toBe(1);
    expect(deepMerge({ a: 1 }, 5)).toBe(5);
  });

  it.each([
    [undefined, undefined, { targets: ['fb'], defaultId: 'fb' }],
    [{ deviceProfile: 'a' }, undefined, { targets: ['a'], defaultId: 'a' }],
    [{ deviceProfiles: ['a', 'b', 'a'] }, undefined, { targets: ['a', 'b'], defaultId: 'a' }],
    [
      { deviceProfiles: ['a', 'b'], defaultDeviceProfile: 'b' },
      'fb',
      { targets: ['a', 'b'], defaultId: 'b' },
    ],
    [{ deviceProfiles: ['a'] }, 'c', { targets: ['c', 'a'], defaultId: 'c' }],
  ])('selectProfiles %#', (project, setting, expected) => {
    expect(selectProfiles(project, setting, 'fb')).toEqual(expected);
  });

  it('file send timeout scales with size, min 120 s', () => {
    const t = { timeouts: { shellMs: 1, fileSendMinMs: 120000, fileSendBytesPerSec: 1024 * 1024 } };
    expect(fileSendTimeoutMs(t, 1024)).toBe(120000);
    expect(fileSendTimeoutMs(t, 100 * 1024 * 1024)).toBe(200000);
  });
});
