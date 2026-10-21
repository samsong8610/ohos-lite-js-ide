/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadSystemModules } from '@ohjs/schemas';
import { writeWorkspaceTypes, type TypesIo } from './workspace-types';

function memIo(
  files: Record<string, string>,
  answer: 'merge' | 'later' | 'never' = 'merge',
  neverMerge = false,
) {
  const writes: string[] = [];
  const logs: string[] = [];
  const asked: string[][] = [];
  const io: TypesIo & { writes: string[]; logs: string[]; asked: string[][]; never: boolean } = {
    writes,
    logs,
    asked,
    never: false,
    neverMerge,
    read: async (rel) => files[rel],
    write: async (rel, c) => {
      writes.push(rel);
      files[rel] = c;
    },
    askMerge: async (ch) => {
      asked.push(ch);
      return answer;
    },
    setNeverMerge: async () => {
      io.never = true;
    },
    log: (m) => logs.push(m),
  };
  return io;
}

const pack = loadSystemModules('5.0.3');

describe('writeWorkspaceTypes', () => {
  it('fresh project: writes .ohjs files and creates jsconfig.json; second run is a no-op', async () => {
    const files: Record<string, string> = {};
    const io = memIo(files);
    expect(await writeWorkspaceTypes(io, pack)).toBe('created');
    expect(io.writes).toEqual([
      '.ohjs/jsconfig.base.json',
      '.ohjs/types/ohjs-env.d.ts',
      '.ohjs/types/system-modules.d.ts',
      'jsconfig.json',
    ]);
    expect(files['.ohjs/types/system-modules.d.ts']).toContain("declare module '@system.router'");
    const again = memIo(files);
    expect(await writeWorkspaceTypes(again, pack)).toBe('unchanged');
    expect(again.writes).toEqual([]);
  });
  it('existing user jsconfig: asks, merges on consent, never overwrites otherwise', async () => {
    const user = '{ "compilerOptions": { "checkJs": true } }';
    const yes = memIo({ 'jsconfig.json': user });
    expect(await writeWorkspaceTypes(yes, pack)).toBe('merged');
    expect(yes.asked).toEqual([['extends += ./.ohjs/jsconfig.base.json']]);
    const later = memIo({ 'jsconfig.json': user }, 'later');
    expect(await writeWorkspaceTypes(later, pack)).toBe('declined');
    expect(later.writes).not.toContain('jsconfig.json');
    expect(later.never).toBe(false);
    const never = memIo({ 'jsconfig.json': user }, 'never');
    expect(await writeWorkspaceTypes(never, pack)).toBe('declined');
    expect(never.never).toBe(true);
    const muted = memIo({ 'jsconfig.json': user }, 'merge', true);
    expect(await writeWorkspaceTypes(muted, pack)).toBe('suppressed');
    expect(muted.asked).toEqual([]);
  });
  it('unparsable jsconfig and SDKs without module data', async () => {
    const io = memIo({ 'jsconfig.json': '{ oops' });
    expect(await writeWorkspaceTypes(io, undefined)).toBe('unparsable');
    expect(io.writes).toEqual(['.ohjs/jsconfig.base.json', '.ohjs/types/ohjs-env.d.ts']);
    expect(io.logs[0]).toContain('not generated');
    expect(io.logs[1]).toContain('left untouched');
  });
});
