/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ViewModelSymbols } from './viewmodel';

/** js_page_state_machine.h PAGE_LIFECYCLE_* */
export const PAGE_LIFECYCLE = ['onInit', 'onReady', 'onShow', 'onHide', 'onDestroy'] as const;
/** js_fwk_common.h ABILITY_LIFECYCLE_CALLBACK_* used by app.js */
export const APP_LIFECYCLE = ['onCreate', 'onDestroy'] as const;

/**
 * Members the lite runtime puts on every ViewModel: `$refs`/`$app` (js_fwk_common.h ATTR_REFS/ATTR_APP),
 * `$watch` (runtime-core ViewModel.prototype), `$t` (localization_module.cpp; `$tc` only with LOCALIZATION_PLURAL).
 */
export const FRAMEWORK_MEMBERS: ReadonlyArray<{
  name: string;
  kind: 'property' | 'function';
  detail: string;
  doc: string;
}> = [
  {
    name: '$refs',
    kind: 'property',
    detail: 'Record<string, element>',
    doc: 'Elements with a `ref` attribute in this page.',
  },
  {
    name: '$app',
    kind: 'property',
    detail: 'app.js ViewModel',
    doc: 'The application object defined in app.js.',
  },
  {
    name: '$t',
    kind: 'function',
    detail: '$t(path: string, params?: object): string',
    doc: 'Translates an i18n key from `i18n/<locale>.json`.',
  },
  {
    name: '$watch',
    kind: 'function',
    detail: '$watch(getter, callback): Observer',
    doc: 'Watches a data expression and calls `callback(newValue)` when it changes.',
  },
];

export interface ThisCompletion {
  label: string;
  kind: 'variable' | 'method' | 'property' | 'function';
  detail: string;
  documentation?: string;
  replace: { start: number; end: number };
  sortText: string;
}

/** `this.` member completion in page/app scripts (FR-LANG-007): data, props, computed, methods, lifecycle, framework members. */
export function completeThis(
  code: string,
  offset: number,
  vm: ViewModelSymbols,
  isApp: boolean,
): ThisCompletion[] {
  const before = code.slice(Math.max(0, offset - 200), offset);
  const m = /\bthis\s*\.\s*([\w$]*)$/.exec(before);
  if (!m) return [];
  let end = offset;
  while (end < code.length && /[\w$]/.test(code[end]!)) end++;
  const replace = { start: offset - m[1]!.length, end };
  const out: ThisCompletion[] = [];
  const add = (
    label: string,
    kind: ThisCompletion['kind'],
    detail: string,
    sort: string,
    documentation?: string,
  ): void => {
    if (out.some((o) => o.label === label)) return;
    out.push({
      label,
      kind,
      detail,
      replace,
      sortText: `${sort}${label}`,
      ...(documentation ? { documentation } : {}),
    });
  };
  for (const d of vm.data) add(d, 'variable', 'data', '0');
  for (const d of vm.props) add(d, 'variable', 'props', '0');
  for (const d of vm.computed) add(d, 'variable', 'computed', '0');
  for (const f of vm.methods) add(f, 'method', 'method', '1');
  const hooks = isApp ? APP_LIFECYCLE : PAGE_LIFECYCLE;
  for (const h of vm.lifecycle) add(h, 'method', 'lifecycle', '2');
  for (const h of hooks) add(h, 'method', 'lifecycle', '2');
  for (const f of FRAMEWORK_MEMBERS) add(f.name, f.kind, f.detail, '3', f.doc);
  return out;
}
