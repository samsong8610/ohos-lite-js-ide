/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  parseAaStartOutput,
  parseBmInstallOutput,
  parseBmSetDisableOutput,
  parseBmUninstallOutput,
} from './bm-aa';

describe('bm/aa stdout matchers', () => {
  it('bm set -s disable', () => {
    expect(parseBmSetDisableOutput('success')).toBe('debug');
    expect(parseBmSetDisableOutput('Set success')).toBe('debug');
    expect(parseBmSetDisableOutput('usage: bm set')).toBe('release');
  });

  it('bm install', () => {
    expect(parseBmInstallOutput('resultMessage is install success !')).toEqual({ ok: true });
    expect(parseBmInstallOutput('resultMessage is ERR_SIGN_FAIL')).toEqual({
      ok: false,
      message: 'ERR_SIGN_FAIL',
    });
  });

  it('bm uninstall', () => {
    expect(parseBmUninstallOutput('resultMessage is uninstall success !')).toEqual({ ok: true });
    expect(parseBmUninstallOutput('resultMessage is ERR_NO_APP')).toEqual({
      ok: false,
      message: 'ERR_NO_APP',
    });
  });

  it('aa start / terminate', () => {
    expect(parseAaStartOutput('ok')).toEqual({ ok: true });
    expect(parseAaStartOutput('Failed to run the command.')).toEqual({
      ok: false,
      message: 'Failed to run the command.',
    });
  });
});
