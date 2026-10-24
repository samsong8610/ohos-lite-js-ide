/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { isFixtureSourceTreeHapLayout, isGoldHapLayout } from './hap-layout';

describe('hap layout helpers', () => {
  it('detects fixture source-tree zip', () => {
    expect(
      isFixtureSourceTreeHapLayout([
        'resources/base/manifest.json',
        'src/main/config.json',
        'src/main/js/default/pages/index/index.js',
      ]),
    ).toBe(true);
  });

  it('detects gold layout', () => {
    expect(
      isGoldHapLayout([
        'config.json',
        'pack.info',
        'assets/entry/resources.index',
        'assets/js/MainAbility/app.bc',
      ]),
    ).toBe(true);
  });
});
