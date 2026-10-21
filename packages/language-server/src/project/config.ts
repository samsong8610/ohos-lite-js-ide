/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { findNodeAtLocation, getNodeValue, parseTree, type Node } from 'jsonc-parser';
import type { Range } from '../hml/parser';

/** bm_lite `ParseDeviceType`: `strcmp(item, DEFAULT_DEVICE_TYPE)` with DEFAULT_DEVICE_TYPE="smartVision" (ARCHITECTURE §8.5). */
export const REQUIRED_DEVICE_TYPE = 'smartVision';
export const HOME_PAGE = 'pages/index/index';

export interface ConfigFinding {
  rule:
    | 'prj/missing-app-module'
    | 'prj/device-type'
    | 'prj/missing-pages'
    | 'prj/first-page-not-index'
    | 'prj/page-file-missing';
  message: string;
  range: Range;
}

export interface ConfigInfo {
  /** module.js[].name → its pages (only entries with a pages array) */
  pages: Map<string, string[]>;
}

const rangeOf = (n: Node): Range => ({ start: n.offset, end: n.offset + n.length });

/** Extracts js[].pages; undefined when the text has no usable root object. */
export function readConfig(text: string): ConfigInfo | undefined {
  const root = parseTree(text);
  if (!root || root.type !== 'object') return undefined;
  const pages = new Map<string, string[]>();
  const js = findNodeAtLocation(root, ['module', 'js']);
  for (const entry of js?.type === 'array' ? (js.children ?? []) : []) {
    const name = findNodeAtLocation(entry, ['name']);
    const list = findNodeAtLocation(entry, ['pages']);
    if (list?.type !== 'array') continue;
    const n = name?.type === 'string' ? String(name.value) : 'default';
    pages.set(
      n,
      (list.children ?? []).filter((c) => c.type === 'string').map((c) => String(c.value)),
    );
  }
  return { pages };
}

/**
 * config.json rules (FR-LANG-008, FR-BLD-008): app/module present, deviceType exactly "smartVision",
 * pages present with pages/index/index first, every page has its .hml.
 * `pageExists(jsName, page)` answers whether `js/<jsName>/<page>.hml` exists.
 */
export function validateConfig(
  text: string,
  pageExists: (jsName: string, page: string) => boolean,
): ConfigFinding[] {
  const out: ConfigFinding[] = [];
  const root = parseTree(text);
  if (!root || root.type !== 'object') return out;
  const whole: Range = { start: root.offset, end: root.offset + 1 };
  const app = findNodeAtLocation(root, ['app']);
  const mod = findNodeAtLocation(root, ['module']);
  for (const [key, node] of [
    ['app', app],
    ['module', mod],
  ] as const) {
    if (node?.type !== 'object')
      out.push({
        rule: 'prj/missing-app-module',
        range: node ? rangeOf(node) : whole,
        message: `config.json must contain an "${key}" object (bm_lite rejects the HAP otherwise)`,
      });
  }
  if (mod?.type !== 'object') return out;
  const modKey: Range = rangeOf(mod.parent!.children![0]!);

  const dt = findNodeAtLocation(mod, ['deviceType']);
  if (!dt) {
    out.push({
      rule: 'prj/device-type',
      range: modKey,
      message: `module.deviceType is missing; it must be ["${REQUIRED_DEVICE_TYPE}"]`,
    });
  } else if (dt.type !== 'array') {
    out.push({
      rule: 'prj/device-type',
      range: rangeOf(dt),
      message: `module.deviceType must be an array containing "${REQUIRED_DEVICE_TYPE}"`,
    });
  } else {
    const items = dt.children ?? [];
    if (!items.some((i) => i.type === 'string' && i.value === REQUIRED_DEVICE_TYPE)) {
      const near = items.find(
        (i) => i.type === 'string' && String(i.value).toLowerCase() === REQUIRED_DEVICE_TYPE.toLowerCase(),
      );
      out.push({
        rule: 'prj/device-type',
        range: rangeOf(near ?? dt),
        message: near
          ? `deviceType "${String(near.value)}" must be exactly "${REQUIRED_DEVICE_TYPE}" (case-sensitive: bm_lite uses strcmp)`
          : `module.deviceType must contain "${REQUIRED_DEVICE_TYPE}" (exact, case-sensitive)`,
      });
    }
  }

  const js = findNodeAtLocation(mod, ['js']);
  const entries = js?.type === 'array' ? (js.children ?? []) : [];
  const withPages = entries.filter((e) => findNodeAtLocation(e, ['pages'])?.type === 'array');
  if (
    !withPages.length ||
    withPages.every((e) => !(findNodeAtLocation(e, ['pages'])!.children ?? []).length)
  ) {
    out.push({
      rule: 'prj/missing-pages',
      range: js ? rangeOf(js) : modKey,
      message: 'module.js[].pages is missing or empty: the app has no pages',
    });
    return out;
  }
  for (const e of withPages) {
    const nameNode = findNodeAtLocation(e, ['name']);
    const jsName = nameNode?.type === 'string' ? String(getNodeValue(nameNode)) : 'default';
    const list = findNodeAtLocation(e, ['pages'])!.children ?? [];
    const first = list[0];
    if (first && (first.type !== 'string' || first.value !== HOME_PAGE))
      out.push({
        rule: 'prj/first-page-not-index',
        range: rangeOf(first),
        message: `The first page (home page) must be "${HOME_PAGE}"`,
      });
    for (const p of list) {
      if (p.type === 'string' && !pageExists(jsName, String(p.value)))
        out.push({
          rule: 'prj/page-file-missing',
          range: rangeOf(p),
          message: `Page "${String(p.value)}" has no js/${jsName}/${String(p.value)}.hml`,
        });
    }
  }
  return out;
}
