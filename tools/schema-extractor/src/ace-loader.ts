/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vm from 'vm';

export interface AceLoaderRules {
  specialStyles: Record<string, string>;
  deviceTypes: Record<string, string>;
  deviceLevels: Record<string, string>;
  platforms: Record<string, string>;
  /** RegExp sources of the lite validators (REGEXP_COLOR, REGEXP_PNG …) */
  regexps: Record<string, string>;
}

/**
 * AceLoaderRulesExtractor (ARCHITECTURE §7.4 P5): evaluates ace-loader `src/lite/lite-enum.js` in an
 * isolated vm context (no require, no process) and reads its exported tables.
 */
export function extractLiteEnum(code: string, timeoutMs = 1000): AceLoaderRules {
  const exportsObj: Record<string, unknown> = {};
  const sandbox = { exports: exportsObj, module: { exports: exportsObj } };
  vm.runInNewContext(code, sandbox, { timeout: timeoutMs, filename: 'lite-enum.js' });
  const ex = (sandbox.module.exports === exportsObj ? exportsObj : sandbox.module.exports) as Record<
    string,
    unknown
  >;
  const table = (k: string): Record<string, string> => {
    const v = ex[k];
    if (typeof v !== 'object' || v === null) return {};
    return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as Record<
      string,
      string
    >;
  };
  const regexps: Record<string, string> = {};
  for (const [k, v] of Object.entries(ex)) {
    // RegExp objects from another realm: duck-type on source/flags
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as RegExp).source === 'string' &&
      typeof (v as RegExp).flags === 'string'
    ) {
      regexps[k] = `/${(v as RegExp).source}/${(v as RegExp).flags}`;
    }
  }
  return {
    specialStyles: table('SPECIAL_STYLE'),
    deviceTypes: table('DEVICE_TYPE'),
    deviceLevels: table('DEVICE_LEVEL'),
    platforms: table('PLATFORM'),
    regexps,
  };
}

/** Image extensions accepted by ace-loader (REGEXP_PNG), e.g. ['png','jpg','bmp','jpeg']. */
export function imageExtensions(rules: AceLoaderRules): string[] {
  const src = rules.regexps['REGEXP_PNG'];
  if (!src) return [];
  // `(\.png|\.jpg)$` and `\.(png|jpg)$` forms
  const exts = [...src.matchAll(/\\\.([A-Za-z]+)/g)].map((m) => m[1]!.toLowerCase());
  for (const g of src.matchAll(/\\\.\(([A-Za-z|]+)\)/g))
    exts.push(...g[1]!.split('|').map((x) => x.toLowerCase()));
  return [...new Set(exts)].sort();
}
