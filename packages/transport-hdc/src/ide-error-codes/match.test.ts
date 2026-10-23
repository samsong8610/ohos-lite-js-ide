/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { IDE_ERROR_CODES_HDC_REF, IDE_ERROR_CODES_VERSION } from './catalog';
import { enrichHdcFailure, matchIdeError, patternMatchesVendored } from './match';
import type { HdcFailure } from '../parser/messages';

describe('ide-error-codes catalog pin', () => {
  it('matches README pin', () => {
    expect(IDE_ERROR_CODES_VERSION).toBe('1.0.0');
    expect(IDE_ERROR_CODES_HDC_REF).toBe('5327930b');
  });
});

describe('patternMatchesVendored', () => {
  it('matches pipe alternatives', () => {
    expect(patternMatchesVendored('install failed|error', 'bm install failed')).toBe(true);
    expect(patternMatchesVendored('install failed|error', 'ok')).toBe(false);
  });
});

describe('matchIdeError (fixture strings from vendored patterns)', () => {
  it('tconn Connect failed', () => {
    const m = matchIdeError('tconn', '[Fail]Connect failed\n');
    expect(m?.ide_hint).toContain('8710');
    expect(m?.code).toBeNull();
  });

  it('tconn E001005', () => {
    const m = matchIdeError('tconn', '[Fail][E001005] Device not found or connected');
    expect(m?.code).toBe('E001005');
    expect(m?.ide_hint).toMatch(/tconn|8710/i);
  });

  it('file E005102 remote path', () => {
    const m = matchIdeError('file', '[Fail][E005102] Remote path: /data/missing/app.hap is invalid');
    expect(m?.code).toBe('E005102');
    expect(m?.ide_hint).toContain('/tmp/ohjs');
  });

  it('bm install failed stdout', () => {
    const m = matchIdeError('bm', 'resultMessage is install failed !');
    expect(m?.ide_hint).toContain('__RC');
  });

  it('aa Failed to run the command', () => {
    const m = matchIdeError('aa', 'Failed to run the command.');
    expect(m?.ide_hint).toMatch(/aa start|HAP/i);
  });

  it('fport Forwardport result:Failed', () => {
    const m = matchIdeError('fport', 'Forwardport result:Failed');
    expect(m?.ide_hint).toMatch(/fport|5001/i);
  });
});

describe('enrichHdcFailure', () => {
  it('adds hint and hdc code from catalog', () => {
    const base: HdcFailure = {
      code: 'TRN-HDCD-UNREACHABLE',
      message: 'Connect failed',
    };
    const out = enrichHdcFailure(base, 'tconn', '[Fail]Connect failed');
    expect(out.hint).toContain('8710');
    expect(out.code).toBe('TRN-HDCD-UNREACHABLE');
  });
});
