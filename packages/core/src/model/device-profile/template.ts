/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OhjsError } from '../../errors';

const PLACEHOLDER = /\{\{|\}\}|\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/** Names of `{name}` placeholders used in a template (`{{` / `}}` are literal braces). */
export function templatePlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) if (m[1]) names.add(m[1]);
  return [...names];
}

/** Quotes a value for the device shell (toybox/busybox sh, always posix). */
export function quoteDeviceShell(value: string): string {
  if (value.length > 0 && /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Renders a device command template; every placeholder must be provided, values are shell-quoted. */
export function renderCommand(template: string, vars: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (m, name: string | undefined) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    const v = vars[name as string];
    if (v === undefined) {
      throw new OhjsError('PRJ-PROFILE-TEMPLATE-VAR', `missing value for {${name}} in "${template}"`);
    }
    return quoteDeviceShell(String(v));
  });
}
