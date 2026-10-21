/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { buildCmdShellArgs, escapeCmdArgument, escapeCmdCommand, isBatchFile } from './escape';

// Table-driven cmd.exe escaping (ARCHITECTURE §14.1: runs on Linux CI as well).
describe('escapeCmdArgument', () => {
  it.each([
    ['simple', false, '^"simple^"'],
    ['with space', false, '^"with^ space^"'],
    ['a"b', false, '^"a\\^"b^"'],
    ['trail\\', false, '^"trail\\\\^"'],
    ['100%', false, '^"100^%^"'],
    ['a&b|c', false, '^"a^&b^|c^"'],
    ['中文 路径', false, '^"中文^ 路径^"'],
    ['x', true, '^^^"x^^^"'],
    ['a&b', true, '^^^"a^^^&b^^^"'],
    ['', false, '^"^"'],
  ])('%j (double=%s)', (arg, dbl, expected) => {
    expect(escapeCmdArgument(arg, dbl)).toBe(expected);
  });
});

describe('cmd helpers', () => {
  it('escapes the command path', () => {
    expect(escapeCmdCommand('C:\\Program Files (x86)\\hvigorw.bat')).toBe(
      'C:\\Program^ Files^ ^(x86^)\\hvigorw.bat',
    );
  });
  it.each([
    ['a.bat', true],
    ['A.CMD', true],
    ['hdc.exe', false],
    ['hdc', false],
  ])('isBatchFile(%s)', (f, r) => expect(isBatchFile(f)).toBe(r));
  it('builds /d /s /c argv', () => {
    const args = buildCmdShellArgs('C:\\t\\hvigorw.bat', ['--mode', 'module']);
    expect(args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(args[3]).toBe('"C:\\t\\hvigorw.bat ^^^"--mode^^^" ^^^"module^^^""');
  });
});
