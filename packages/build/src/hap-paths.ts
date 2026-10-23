/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path';
import type { FaModuleInfo } from './project-info';

/** DevEco 3.1 Lite JS install HAP: `<module>/build/default/outputs/default/app/<module>-default.hap`. */
export function devecoHapOutputPath(module: FaModuleInfo): string {
  return path.join(
    module.moduleRoot,
    'build',
    'default',
    'outputs',
    'default',
    'app',
    `${module.moduleName}-default.hap`,
  );
}

export function devecoPackInfoOutputPath(module: FaModuleInfo): string {
  return path.join(module.moduleRoot, 'build', 'default', 'outputs', 'default', 'pack.info');
}
