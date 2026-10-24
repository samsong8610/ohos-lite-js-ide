/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveAceLoaderInstall } from './ace-loader-config';

const fakeAceRoot = path.join(__dirname, '../test/fixtures/fake-ace-loader');

describe('resolveAceLoaderInstall', () => {
  it('manual aceLoaderPath wins over aceLoaderAutoRoot', () => {
    const manual = fakeAceRoot;
    const auto = '/nonexistent/auto-root';
    const install = resolveAceLoaderInstall({
      workspaceRoot: '/tmp',
      aceLoaderPath: manual,
      aceLoaderAutoRoot: auto,
    });
    expect(install?.root).toBe(manual);
  });

  it('uses aceLoaderAutoRoot when manual paths are unset', () => {
    const install = resolveAceLoaderInstall({
      workspaceRoot: '/tmp',
      aceLoaderAutoRoot: fakeAceRoot,
    });
    expect(install?.root).toBe(fakeAceRoot);
  });
});
