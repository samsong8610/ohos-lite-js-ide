/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { activationBudgetMs } from './activation-budget';

describe('activationBudgetMs (integration smoke)', () => {
  it('defaults to 500 ms locally', () => {
    expect(activationBudgetMs({}, 'linux')).toBe('500');
  });

  it('uses 1000 ms on CI for Linux/macOS', () => {
    expect(activationBudgetMs({ CI: 'true' }, 'linux')).toBe('1000');
    expect(activationBudgetMs({ CI: 'true' }, 'darwin')).toBe('1000');
  });

  it('uses 2000 ms on CI for Windows', () => {
    expect(activationBudgetMs({ CI: 'true' }, 'win32')).toBe('2000');
  });

  it('respects OHJS_ACTIVATION_BUDGET_MS override', () => {
    expect(activationBudgetMs({ OHJS_ACTIVATION_BUDGET_MS: '750' }, 'win32')).toBe('750');
  });
});
