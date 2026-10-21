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
 * OpenHarmony `js/` source tree (CSS/JS features arrive in later batches).
 */
export function languageDocumentSelector(): DocumentFilter[] {
  return [
    { scheme: 'file', language: 'hml' },
    { scheme: 'file', language: 'css', pattern: '**/src/main/js/**/*.css' },
    { scheme: 'file', language: 'less', pattern: '**/src/main/js/**/*.less' },
    { scheme: 'file', language: 'javascript', pattern: '**/src/main/js/**/*.js' },
  ];
}

export function sdkStatusText(p: { version: string; ok: boolean; provisional: boolean }): string {
  return `$(${p.ok ? 'versions' : 'warning'}) OH ${p.version}${p.provisional ? ' (provisional)' : ''}`;
}
