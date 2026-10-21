/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// vscode-independent pieces of the language client wiring (unit-tested).

export interface DocumentFilter {
  scheme: string;
  language: string;
  pattern?: string;
}

/**
 * Documents synchronized to the language server: every HML file, plus CSS/LESS/JS under an
 * OpenHarmony `js/` source tree, config.json and i18n files.
 */
export function languageDocumentSelector(): DocumentFilter[] {
  return [
    { scheme: 'file', language: 'hml' },
    { scheme: 'file', language: 'css', pattern: '**/src/main/js/**/*.css' },
    { scheme: 'file', language: 'less', pattern: '**/src/main/js/**/*.less' },
    { scheme: 'file', language: 'javascript', pattern: '**/src/main/js/**/*.js' },
    { scheme: 'file', language: 'json', pattern: '**/src/main/config.json' },
    { scheme: 'file', language: 'json', pattern: '**/src/main/js/*/i18n/*.json' },
  ];
}

export function sdkStatusText(p: { version: string; ok: boolean; provisional: boolean }): string {
  return `$(${p.ok ? 'versions' : 'warning'}) OH ${p.version}${p.provisional ? ' (provisional)' : ''}`;
}

export interface SdkVersionChoice {
  version: string;
  source: 'project' | 'setting';
}

/**
 * SDK version priority (ARCHITECTURE §7.1): `.ohjs/project.json` `sdkVersion` first, the
 * `ohjs.sdkVersion` setting as fallback. Unreadable/invalid project files fall back silently.
 */
export function resolveSdkVersion(projectJson: string | undefined, setting: string): SdkVersionChoice {
  if (projectJson !== undefined) {
    try {
      const v = (JSON.parse(projectJson) as { sdkVersion?: unknown } | null)?.sdkVersion;
      if (typeof v === 'string' && v.trim()) return { version: v.trim(), source: 'project' };
    } catch {
      // half-edited JSON: keep using the setting
    }
  }
  return { version: setting, source: 'setting' };
}

export type Translate = (message: string, ...args: Array<string | number | boolean>) => string;
const identity: Translate = (m, ...args) =>
  m.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)]));

/**
 * Status bar tooltip: active version, where it came from, and, when `.ohjs/project.json` wins over a
 * different `ohjs.sdkVersion`, a note that the setting is overridden (no pop-up).
 */
export function sdkTooltip(
  p: { version: string; ok: boolean; available: readonly string[]; error?: string },
  choice: SdkVersionChoice,
  setting: string,
  t: Translate = identity,
): string {
  if (!p.ok) return p.error ?? t('SDK switch failed');
  const lines = [
    choice.source === 'project'
      ? t('OpenHarmony SDK {0} (from .ohjs/project.json)', p.version)
      : t('OpenHarmony SDK {0} (from setting ohjs.sdkVersion)', p.version),
  ];
  if (choice.source === 'project' && setting !== choice.version)
    lines.push(t('Setting value {0} is overridden by project.json', setting));
  lines.push(t('Available: {0}', p.available.join(', ')));
  return lines.join('\n');
}
