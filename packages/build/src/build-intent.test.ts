/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { requiresAceLoaderGoldPack } from './build-intent';

describe('requiresAceLoaderGoldPack', () => {
  it('is true when ohjs.build.aceLoaderPath or restoolPath is set', () => {
    expect(requiresAceLoaderGoldPack({ aceLoaderPath: '/sdk/ace-loader' })).toBe(true);
    expect(requiresAceLoaderGoldPack({ restoolPath: '/sdk/toolchains/restool' })).toBe(true);
  });

  it('is true for ace-loader backend', () => {
    expect(requiresAceLoaderGoldPack({ backend: 'ace-loader' })).toBe(true);
  });

  it('is false for plain auto without manual toolchain paths', () => {
    expect(requiresAceLoaderGoldPack({ backend: 'auto' })).toBe(false);
    expect(requiresAceLoaderGoldPack({ backend: 'fixture' })).toBe(false);
  });
});
