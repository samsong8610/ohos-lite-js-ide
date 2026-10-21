/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { buildSystemModules, parseModuleConfig } from './system-modules';

const HEADER = `#ifndef OHOS_ACELITE_OHOS_MODULE_CONFIG_H
#define OHOS_ACELITE_OHOS_MODULE_CONFIG_H
extern void InitRouterModule(JSIValue exports);
// Config information for built-in JS modules of OHOS platform
const Module OHOS_MODULES[] = {
#if (ENABLE_MODULE_REQUIRE_TEST == 1)
    {"sample", InitSampleModule},
#endif
    {"app", InitAppModule},
#if (FEATURE_SUPPORT_HTTP == 1)
    {"fetch", InitFetchModule},
#endif // FEATURE_SUPPORT_HTTP
    {"router", InitRouterModule},
#if (ENABLE_MODULE_CIPHER == 1)
    {"cipher", InitCipherModule},
#endif
/* {"commented", InitX}, */
#ifdef FEATURE_CAMERA_X
    {"camera", InitCameraModule},
#endif
};
const Module OTHER[] = { {"ignored", InitIgnored} };
#endif
`;

describe('system modules (module_manager/ohos_module_config.h)', () => {
  it('parses OHOS_MODULES entries with their guards and lines', () => {
    expect(parseModuleConfig(HEADER)).toEqual([
      { name: 'sample', init: 'InitSampleModule', guard: 'ENABLE_MODULE_REQUIRE_TEST', line: 7 },
      { name: 'app', init: 'InitAppModule', line: 9 },
      { name: 'fetch', init: 'InitFetchModule', guard: 'FEATURE_SUPPORT_HTTP', line: 11 },
      { name: 'router', init: 'InitRouterModule', line: 13 },
      { name: 'cipher', init: 'InitCipherModule', guard: 'ENABLE_MODULE_CIPHER', line: 15 },
      { name: 'camera', init: 'InitCameraModule', guard: 'FEATURE_CAMERA_X', line: 19 },
    ]);
    expect(parseModuleConfig('const int x = 1;')).toEqual([]);
  });
  it('applies target feature switches; test-only modules dropped; undefined macro = off', () => {
    const f = buildSystemModules(
      parseModuleConfig(HEADER),
      { ENABLE_MODULE_CIPHER: { value: true }, FEATURE_CAMERA_X: { value: 'conditional' } },
      { ohVersion: '5.0.3', target: 'linux', generator: 'g' },
    );
    expect(f).toMatchObject({
      schemaFormat: 1,
      ohVersion: '5.0.3',
      target: 'linux',
      categories: ['system', 'ohos'],
    });
    expect(f.modules.map((m) => [m.name, m.availability, m.feature ?? ''])).toEqual([
      ['app', 'available', ''],
      ['camera', 'conditional', 'FEATURE_CAMERA_X'],
      ['cipher', 'available', 'ENABLE_MODULE_CIPHER'],
      ['fetch', 'disabled-by-feature', 'FEATURE_SUPPORT_HTTP'],
      ['router', 'available', ''],
    ]);
    expect(f.modules[0]!.evidence).toEqual([
      { repo: 'engine', file: 'frameworks/module_manager/ohos_module_config.h', line: 9 },
    ]);
  });
});
