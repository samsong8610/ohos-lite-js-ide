/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, ToolLocator, type CommandSpec, type IPlatform, type IProcessRunner } from '@ohjs/core';
import {
  resolveAceLoaderInstall,
  type AceLoaderDiscoveryOptions,
  type AceLoaderInstall,
} from './ace-loader-config';
import { findJsSourceRoot, prepareAceModuleRoot } from './fa-prep';
import { devecoHapOutputPath, devecoPackInfoOutputPath } from './hap-paths';
import { packFaHap } from './hap-packer';
import type { FaModuleInfo } from './project-info';
import type { BuildResult } from './types';

export type AceBuildMode = 'debug' | 'release';
export type AceDeviceType = 'smartVision' | 'liteWearable';

export interface AceLoaderBuildOptions extends AceLoaderDiscoveryOptions {
  outDir: string;
  buildMode?: AceBuildMode;
  deviceType?: AceDeviceType;
  restoolPath?: string;
}

export function webpackLiteCommand(
  platform: IPlatform,
  install: AceLoaderInstall,
  env: Record<string, string>,
  buildMode: AceBuildMode,
): CommandSpec {
  const node = new ToolLocator(platform).locate('node').path;
  return {
    file: node,
    args: [install.webpackCli, '--config', install.webpackConfig, '--env', `buildMode=${buildMode}`],
    cwd: install.root,
    env,
  };
}

export function aceLoaderWebpackEnv(
  platform: IPlatform,
  params: {
    aceModuleRoot: string;
    aceModuleBuild: string;
    aceManifestPath: string;
    buildMode: AceBuildMode;
    deviceType: AceDeviceType;
    baseEnv?: Record<string, string | undefined>;
  },
): Record<string, string> {
  return platform.mergeEnv(
    {
      DEVICE_LEVEL: 'lite',
      DEVICE_TYPE: params.deviceType,
      aceModuleRoot: params.aceModuleRoot,
      aceModuleBuild: params.aceModuleBuild,
      buildMode: params.buildMode,
      aceManifestPath: params.aceManifestPath,
    },
    params.baseEnv ?? (process.env as Record<string, string | undefined>),
  );
}

export async function runAceLoaderBuild(
  platform: IPlatform,
  runner: IProcessRunner,
  module: FaModuleInfo,
  opts: AceLoaderBuildOptions,
): Promise<BuildResult> {
  const install = resolveAceLoaderInstall(opts);
  if (!install) {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      'ace-loader backend requested but ace-loader root (webpack.lite.config.js + webpack CLI) was not found',
    );
  }

  const buildMode = opts.buildMode ?? 'debug';
  const deviceType = opts.deviceType ?? 'smartVision';
  const jsOutDir = path.join(opts.outDir, 'ace-js');
  fs.rmSync(jsOutDir, { recursive: true, force: true });
  fs.mkdirSync(jsOutDir, { recursive: true });

  const { aceModuleRoot, aceManifestPath, jsSrcPath } = prepareAceModuleRoot(
    module.moduleRoot,
    module.configPath,
    opts.outDir,
  );

  const env = platform.mergeEnv(
    {
      DEVICE_LEVEL: 'lite',
      DEVICE_TYPE: deviceType,
      aceModuleRoot,
      aceModuleBuild: jsOutDir,
      buildMode,
      aceManifestPath,
      aceAbilitySrcPath: jsSrcPath,
    },
    process.env as Record<string, string | undefined>,
  );

  const cmd = webpackLiteCommand(platform, install, env, buildMode);
  const r = await runner.run(cmd, { timeoutMs: 600000 });
  if (r.exitCode !== 0) {
    throw new OhjsError('BLD-FAILED', `ace-loader webpack failed: ${r.stderr || r.stdout}`, {
      exitCode: r.exitCode,
      cmd,
    });
  }

  const hapPath = devecoHapOutputPath(module);
  const packInfoPath = devecoPackInfoOutputPath(module);
  const jsSourceRoot = findJsSourceRoot(module.moduleRoot, module.configPath);
  await packFaHap({
    module,
    jsBuildDir: jsOutDir,
    jsSourceRoot,
    stagingRoot: opts.outDir,
    hapPath,
    packInfoPath,
    runner,
    restoolPath: opts.restoolPath,
  });

  if (!fs.existsSync(hapPath)) {
    throw new OhjsError('BLD-FAILED', 'ace-loader build did not produce a HAP', { hint: hapPath });
  }

  return { hapPath, module, backend: 'ace-loader' };
}
