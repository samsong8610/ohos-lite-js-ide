/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type IPlatform } from '@ohjs/core';
import { packStagingToHap } from './zip-hap';
import type { FaModuleInfo } from './project-info';
import type { BuildResult } from './types';

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * CI-friendly build: copies module sources into a HAP-shaped tree and zips it.
 * Real ace-loader integration is selected via {@link BuildService} when configured.
 */
export async function runFixtureBuild(
  _platform: IPlatform,
  module: FaModuleInfo,
  outDir: string,
): Promise<BuildResult> {
  const staging = path.join(outDir, 'staging', module.moduleName);
  fs.rmSync(staging, { recursive: true, force: true });
  const mainSrc = path.join(module.moduleRoot, 'src', 'main');
  if (!fs.existsSync(mainSrc)) {
    throw new OhjsError('BLD-FAILED', `Missing src/main under ${module.moduleRoot}`);
  }
  copyDir(mainSrc, path.join(staging, 'src', 'main'));
  fs.mkdirSync(path.join(staging, 'resources', 'base'), { recursive: true });
  fs.writeFileSync(
    path.join(staging, 'resources', 'base', 'manifest.json'),
    JSON.stringify({ app: { bundleName: module.bundleName } }, null, 2),
  );

  const hapPath = path.join(outDir, `${module.moduleName}.hap`);
  await packStagingToHap(staging, hapPath);
  return { hapPath, module, backend: 'fixture' };
}
