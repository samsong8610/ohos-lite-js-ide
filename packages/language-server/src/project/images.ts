/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// res/image-format (FR-LANG-006, SPEC §4 "图片支持 BMP/JPEG/PNG"): the lite toolchain only converts the
// extensions in ace-loader's REGEXP_PNG / lite-image-coverter-plugin (schema `aceLoader.imageExtensions`).
import type { Range } from '../hml/parser';

export interface ImageFinding {
  rule: 'res/image-format';
  range: Range;
  message: string;
}

/** Checks one static image reference; `range` covers `value`. Bound (`{{ }}`) and extension-less values pass. */
export function checkImagePath(
  value: string,
  range: Range,
  extensions: readonly string[],
): ImageFinding | undefined {
  if (!value || value.includes('{{') || /^data:/i.test(value)) return undefined;
  const clean = value.replace(/[?#].*$/, '');
  const m = /\.([A-Za-z0-9]+)$/.exec(clean.slice(clean.lastIndexOf('/') + 1));
  if (!m) return undefined;
  if (extensions.includes(m[1]!.toLowerCase())) return undefined;
  return {
    rule: 'res/image-format',
    range,
    message: `Image format ".${m[1]}" is not supported by ArkUI.Lite (use ${extensions.map((e) => `.${e}`).join(', ')})`,
  };
}

/** `url(...)` references inside a CSS value, with ranges relative to the value start. */
export function cssUrls(value: string): Array<{ url: string; start: number; end: number }> {
  const out: Array<{ url: string; start: number; end: number }> = [];
  for (const m of value.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
    const start = m.index + m[0].indexOf(m[2]!, 4);
    out.push({ url: m[2]!, start, end: start + m[2]!.length });
  }
  return out;
}
