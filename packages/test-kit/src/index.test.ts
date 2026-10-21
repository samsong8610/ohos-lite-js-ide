/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import { NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { describe, expect, it } from 'vitest';
import { createMockHdc } from './index';

const runner = new NodeProcessRunner(createHostPlatform());

describe('mock-hdc executable', () => {
  it('runs through the wrapper and records calls', async () => {
    const m = createMockHdc({ targets: [{ key: 'K' }] });
    const r = await runner.run({ file: m.hdcPath, args: ['list', 'targets'], env: m.env });
    expect(r.stdout).toBe('K\r\n');
    expect(m.calls()).toEqual([['list', 'targets']]);
    expect(m.devicePath('1.2.3.4:8710', '/tmp/x')).toMatch(/1\.2\.3\.4_8710[\\/]tmp[\\/]x$/);
    m.dispose();
    expect(fs.existsSync(m.stateDir)).toBe(false);
    expect(m.calls()).toEqual([]);
  });

  it('device shell builtins: touch / ls / cat / rm and $?', async () => {
    const m = createMockHdc({ targets: [{ key: 'K' }] });
    const sh = async (c: string) =>
      (await runner.run({ file: m.hdcPath, args: ['shell', c], env: m.env })).stdout;
    expect(await sh('touch /flag; ls /flag; echo rc=$?')).toBe('/flag\r\nrc=0\r\n');
    expect(await sh('cat /flag')).toBe('\r\n');
    expect(await sh('rm -f /flag; ls /flag; echo rc=$?')).toContain('rc=1');
    expect(await sh('rm /nope; echo $?')).toContain('1');
    expect(await sh('cat /nope')).toContain('No such file');
    expect(await sh('mkdir /d; rm -rf /d; echo ok')).toBe('ok\r\n');
    m.dispose();
  });

  it('error paths: no target, multiple targets, unknown commands, bad args', async () => {
    const none = createMockHdc({});
    const run = async (m: ReturnType<typeof createMockHdc>, ...args: string[]) =>
      (await runner.run({ file: m.hdcPath, args, env: m.env })).stdout;
    expect(await run(none, 'shell', 'ls')).toContain('No any connected target');
    expect(await run(none, 'list', 'targets', '-v')).toContain('[Empty]');
    expect(await run(none, 'list', 'nothing')).toContain('Unknown command');
    expect(await run(none, 'frobnicate')).toContain('[E001001]');
    expect(await run(none, 'version')).toContain('Ver: 3.1.0e');
    expect(await run(none, 'kill')).toContain('Kill server');
    expect(await run(none, '-s', '127.0.0.1:8710', 'fport', 'ls')).toContain('[Empty]');
    none.dispose();
    const two = createMockHdc({ targets: [{ key: 'A' }, { key: 'B' }] });
    expect(await run(two, 'shell', 'ls')).toContain('Not match target');
    expect(await run(two, '-t', 'A', 'file', 'send')).toContain('no local and remote');
    expect(await run(two, '-t', 'A', 'file', 'copy', 'a', 'b')).toContain('Unknown file option');
    expect(await run(two, '-t', 'A', 'fport', 'tcp:x', 'tcp:1')).toContain('Forward parament failed');
    expect(await run(two, 'tconn', '1.1.1.1:1')).toContain('Connect failed');
    two.dispose();
  });

  it('tconn re-connects an offline TCP target', async () => {
    const m = createMockHdc({
      targets: [{ key: '10.0.0.2:8710', connType: 'TCP', state: 'Offline' }],
      reachable: ['10.0.0.2:8710'],
    });
    await runner.run({ file: m.hdcPath, args: ['tconn', '10.0.0.2:8710'], env: m.env });
    const r = await runner.run({ file: m.hdcPath, args: ['list', 'targets', '-v'], env: m.env });
    expect(r.stdout).toContain('10.0.0.2:8710\t\tTCP\tConnected');
    m.dispose();
  });

  it('selects the Windows wrapper when asked', () => {
    const m = createMockHdc({}, true);
    expect(m.hdcPath.endsWith('hdc.cmd')).toBe(true);
    m.dispose();
  });
});
