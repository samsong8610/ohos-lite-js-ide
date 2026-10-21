/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Samples are built from the developtools_hdc format strings (5.0.3 / 6.1-LTS). Real-board samples: V-4.
import { describe, expect, it } from 'vitest';
import {
  classifyFailure,
  findFailure,
  guessConnType,
  lines,
  parseFileTransfer,
  parseFportAdd,
  parseFportList,
  parseFportRemove,
  parseShellOutput,
  parseTargets,
  parseTconn,
  parseVersion,
  stripInfo,
  wrapWithRc,
} from './index';

describe('lines', () => {
  it('handles CRLF and blank lines', () => {
    expect(lines('a\r\n\r\n b \r\nc')).toEqual(['a', ' b', 'c']);
  });
});

describe('parseTargets', () => {
  it('verbose output (BuildDaemonVisableLine)', () => {
    const out =
      '7001005458323933328a01ab\t\tUSB\tConnected\t2k0300\r\n' +
      '192.168.1.20:8710\t\tTCP\tOffline\tunknown...\r\n' +
      '192.168.1.21:8710\t\tTCP\tUnauthorized\tboard two\r\n' +
      'abc\t\tUART\tWeird\tx\r\n';
    expect(parseTargets(out)).toEqual([
      { key: '7001005458323933328a01ab', connType: 'USB', state: 'Connected', name: '2k0300' },
      { key: '192.168.1.20:8710', connType: 'TCP', state: 'Offline', name: undefined },
      { key: '192.168.1.21:8710', connType: 'TCP', state: 'Unauthorized', name: 'board two' },
      { key: 'abc', connType: 'UART', state: 'Unknown', name: 'x' },
    ]);
  });
  it('plain output', () => {
    expect(parseTargets('192.168.1.20:8710\r\nSERIAL1\tUnauthorized\r\n')).toEqual([
      { key: '192.168.1.20:8710', connType: 'TCP', state: 'Connected' },
      { key: 'SERIAL1', connType: 'USB', state: 'Unauthorized' },
    ]);
  });
  it.each(['[Empty]\r\n', '', '[Fail]No any connected target\r\n', '[Info]something\r\n'])(
    'empty for %j',
    (o) => {
      expect(parseTargets(o)).toEqual([]);
    },
  );
  it.each([
    ['10.0.0.1:8710', 'TCP'],
    ['[fe80::1]:8710', 'TCP'],
    ['7001005458323933328a01ab', 'USB'],
  ])('guessConnType(%s)', (k, t) => expect(guessConnType(k)).toBe(t));
});

describe('failure classification', () => {
  it.each([
    ['[Fail]No any connected target', 'TRN-HDC-NO-TARGET'],
    ['[Fail]Not match target founded, check connect-key please', 'TRN-HDC-TARGET-NOT-FOUND'],
    ['[Fail]Device Unauthorized', 'TRN-HDC-UNAUTHORIZED'],
    ['[Fail]Connect failed', 'TRN-HDCD-UNREACHABLE'],
    ['[Fail]CreateConnect failed', 'TRN-HDCD-UNREACHABLE'],
    [
      "[Fail][E005102] Remote path: /x is invalid, no such file/directory or it's out of permission",
      'TRN-HDC-REMOTE-PATH',
    ],
    ['[Fail]Error opening file: no such file or directory, path:/tmp/x', 'TRN-HDC-REMOTE-PATH'],
    ['[Fail]Transfer Stop at:10/100(Bytes), Reason: broken', 'TRN-HDC-FILE-TRANSFER'],
    ['[Fail]There is no local and remote path', 'TRN-HDC-FILE-TRANSFER'],
    ['[Fail]Forward parament failed', 'TRN-HDC-FPORT'],
    ['[Fail]Forwardport result:Failed', 'TRN-HDC-FPORT'],
    ['[Fail]Remove forward ruler failed, ruler is not exist tcp:1 tcp:2', 'TRN-HDC-FPORT'],
    ['[Fail][E001001]Unknown command', 'TRN-HDC-UNKNOWN-COMMAND'],
    ['[Fail]Connect server failed', 'TRN-HDC-SERVER'],
    ['[Fail]something new', 'TRN-HDC-FAILED'],
  ])('%s → %s', (out, code) => {
    expect(findFailure(`noise\r\n${out}\r\n`)?.code).toBe(code);
  });
  it('extracts hdc error codes and hints', () => {
    const f = classifyFailure('[E005102] Remote path: /x is invalid');
    expect(f.hdcCode).toBe('E005102');
    expect(f.hint).toMatch(/tmpDir/);
    expect(classifyFailure('plain').hdcCode).toBeUndefined();
  });
  it('no [Fail] line → undefined', () => {
    expect(findFailure('Connect OK\r\n')).toBeUndefined();
  });
  it('stripInfo', () => {
    expect(stripInfo('[Info]a\r\nb')).toBe('a\nb');
  });
});

describe('version / tconn', () => {
  it.each([
    ['Ver: 3.1.0e\r\n', '3.1.0e'],
    ['Ver: 3.2.0c', '3.2.0c'],
    ['Ver: 2.0.0a\nClient version: x', '2.0.0a'],
    ['hdc', undefined],
  ])('parseVersion(%j)', (o, v) => expect(parseVersion(o)).toBe(v));

  it.each([
    ['Connect OK\r\n', true, undefined],
    ['[Info]Target is connected, repeat operation\r\n', true, undefined],
    ['[Fail]Connect failed\r\n', false, 'TRN-HDCD-UNREACHABLE'],
    ['', false, 'TRN-HDCD-UNREACHABLE'],
    ['garbage', false, 'TRN-HDC-FAILED'],
  ])('parseTconn(%j)', (o, ok, code) => {
    const r = parseTconn(o);
    expect(r.ok).toBe(ok);
    expect(r.failure?.code).toBe(code);
  });
});

describe('file transfer', () => {
  it('parses the finish line', () => {
    const r = parseFileTransfer(
      'FileTransfer finish, Size:10485760, File count = 1, time:2048ms rate:5120.00kB/s\r\n',
    );
    expect(r).toEqual({
      ok: true,
      stats: { sizeBytes: 10485760, fileCount: 1, timeMs: 2048, rateKBps: 5120 },
    });
  });
  it.each([
    ['[Fail]Error opening file: no such file or directory, path:/nope/a.hap', 'TRN-HDC-REMOTE-PATH'],
    ['[Fail]Transfer Stop at:1/2(Bytes), Reason: x', 'TRN-HDC-FILE-TRANSFER'],
    ['', 'TRN-HDC-FILE-TRANSFER'],
    [
      'FileTransfer finish, Size:1, File count = 1, time:1ms rate:1.00kB/s\r\n[Fail]Transfer Stop',
      'TRN-HDC-FILE-TRANSFER',
    ],
  ])('failure %j', (o, code) => {
    const r = parseFileTransfer(o);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe(code);
  });
});

describe('fport', () => {
  it('lists rules (BuildForwardVisableLine)', () => {
    const out =
      '7001005458323933328a01ab    tcp:15001 tcp:5001    [Forward]\r\n192.168.1.20:8710    tcp:9000 tcp:9001    [Reverse]\r\nbad line\r\n';
    expect(parseFportList(out)).toEqual([
      { key: '7001005458323933328a01ab', local: 'tcp:15001', remote: 'tcp:5001', direction: 'forward' },
      { key: '192.168.1.20:8710', local: 'tcp:9000', remote: 'tcp:9001', direction: 'reverse' },
    ]);
    expect(parseFportList('[Empty]\r\n')).toEqual([]);
  });
  it.each([
    ['Forwardport result:OK\r\n', true],
    ['[Fail]Forwardport result:Failed\r\n', false],
    ['', false],
  ])('add %j', (o, ok) => expect(parseFportAdd(o).ok).toBe(ok));
  it.each([
    ['Remove forward ruler success, ruler:tcp:1 tcp:2\r\n', true],
    ['[Fail]Remove forward ruler failed, ruler is not exist tcp:1 tcp:2\r\n', false],
    ['', false],
  ])('rm %j', (o, ok) => expect(parseFportRemove(o).ok).toBe(ok));
  it('failure codes', () => {
    expect(parseFportAdd('').failure?.code).toBe('TRN-HDC-FPORT');
    expect(parseFportRemove('').failure?.code).toBe('TRN-HDC-FPORT');
  });
});

describe('shell rc marker', () => {
  it('wraps and parses', () => {
    expect(wrapWithRc('ls /x')).toBe('ls /x; echo __OHJS_RC=$?');
    expect(parseShellOutput('a\r\nb\r\n__OHJS_RC=0\r\n')).toEqual({ output: 'a\nb\n', exitCode: 0 });
    expect(parseShellOutput('__OHJS_RC=127\n')).toEqual({ output: '', exitCode: 127 });
    expect(parseShellOutput('no marker')).toEqual({ output: 'no marker', exitCode: null });
    expect(parseShellOutput('x __OHJS_RC=1')).toEqual({ output: 'x __OHJS_RC=1', exitCode: null });
  });
});
