/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FaModuleInfo } from './project-info';

export interface BuildResult {
  hapPath: string;
  module: FaModuleInfo;
  backend: 'fixture' | 'ace-loader';
}
