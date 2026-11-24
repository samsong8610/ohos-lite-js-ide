/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path';
import type { FaModuleInfo } from './project-info';

/** Install HAP file name is the bundle name, e.g. `me.listdemo.hap`. */
export function hapFileName(bundleName: string): string {
  return `${bundleName}.hap`;
}

/** `<module>/build/default/outputs/default/app/<bundleName>.hap`. */
export function devecoHapOutputPath(module: FaModuleInfo): string {
  return path.join(
    module.moduleRoot,
    'build',
    'default',
    'outputs',
    'default',
    'app',
    hapFileName(module.bundleName),
  );
}

export function devecoPackInfoOutputPath(module: FaModuleInfo): string {
  return path.join(module.moduleRoot, 'build', 'default', 'outputs', 'default', 'pack.info');
}
