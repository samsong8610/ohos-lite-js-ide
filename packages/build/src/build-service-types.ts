/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type BuildBackendKind = 'auto' | 'fixture' | 'ace-loader';

export interface BuildIntentOptions {
  backend?: BuildBackendKind;
  aceLoaderPath?: string;
  aceLoaderMain?: string;
  restoolPath?: string;
}
