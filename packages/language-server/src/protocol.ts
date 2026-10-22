/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Custom LSP messages shared by the server and the extension client (ARCHITECTURE §7.1, §16.2).

/** Client → server: the project's SDK version changed; the server swaps schemas and re-validates. */
export const SDK_CHANGED_NOTIFICATION = 'ohjs/sdkChanged';
export interface SdkChangedParams {
  version: string;
}

/** Server → client: result of an SDK switch (also sent after start-up). */
export const SDK_STATUS_NOTIFICATION = 'ohjs/sdkStatus';
export interface SdkStatusParams {
  version: string;
  ok: boolean;
  provisional: boolean;
  available: string[];
  error?: string;
}

export interface InitializationOptions {
  sdkVersion?: string;
  /** directory holding `<version>/components.json`; defaults to the bundled packs */
  schemaDir?: string;
  rules?: Record<string, unknown>;
  /** `ohjs.diagnostics.transpilableSyntax` */
  transpilableSyntax?: string;
  /** diagnostics debounce in ms (default 200, ARCHITECTURE §7.2) */
  debounceMs?: number;
}

/** `workspace/configuration` section read for rule settings */
export const SETTINGS_SECTION = 'ohjs.lang';
/** `workspace/configuration` section read for `transpilableSyntax` */
export const DIAGNOSTICS_SECTION = 'ohjs.diagnostics';
