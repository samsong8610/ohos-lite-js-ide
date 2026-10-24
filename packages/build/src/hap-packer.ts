/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type IProcessRunner } from '@ohjs/core';
import type { FaModuleInfo } from './project-info';
import { parseFaModuleConfig } from './project-info';
import { assertJerryBytecode } from './hap-content';
import {
  compileEntryResourcesIndex,
  enrichPackagedConfig,
  stageEntryResources,
  type FaResourceEntry,
} from './lite-resources';
import { packStagingToHap } from './zip-hap';

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const JERRY_LITE_SNAPSHOT_BC_HINT =
  'Upstream webpack.lite.config.js runs SnapshotPlugin (ace-loader `bin/jerry-snapshot` → sibling `.bc` with JRRY1 magic) ' +
  'only when buildMode=release; debug emits `.js` only. OHJS defaults ohjs.build.buildMode to release for gold HAP. ' +
  'If `.bc` is still missing in release, ensure `bin/jerry-snapshot` (or `jerry-snapshot.exe` on Windows) exists under ' +
  'your ace-loader install — SnapshotPlugin only console.errors when the tool is missing. OHJS does not synthesize stub `.bc`.';

export function jerryBytecodeMissingError(jsPath: string, expectedBcPath: string): OhjsError {
  return new OhjsError('BLD-FAILED', `ace-loader output missing Jerry lite snapshot bytecode for ${jsPath}`, {
    hint: `${JERRY_LITE_SNAPSHOT_BC_HINT} Expected sibling: ${expectedBcPath}`,
  });
}

export function validateJerryBytecodeTree(jsAbilityDir: string): void {
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) {
        const bc = full.replace(/\.js$/, '.bc');
        if (!fs.existsSync(bc)) {
          throw jerryBytecodeMissingError(full, bc);
        }
        assertJerryBytecode(fs.readFileSync(bc), bc);
      }
    }
  };
  walk(jsAbilityDir);
}

/** Webpack `aceModuleBuild` layout before FA HAP staging (matches {@link stageJsAbilityTree}). */
export function resolveWebpackJsAbilityDir(jsBuildDir: string, srcPath: string): string {
  const nested = path.join(jsBuildDir, srcPath);
  if (fs.existsSync(path.join(nested, 'app.js')) || fs.existsSync(path.join(nested, 'pages'))) {
    return nested;
  }
  if (fs.existsSync(path.join(jsBuildDir, 'app.js')) || fs.existsSync(path.join(jsBuildDir, 'pages'))) {
    return jsBuildDir;
  }
  return jsBuildDir;
}

/** Fail before restool/HAP staging when webpack produced `.js` without lite snapshot `.bc`. */
export function preflightWebpackJerryBytecode(jsBuildDir: string, srcPath: string): void {
  const abilityDir = resolveWebpackJsAbilityDir(jsBuildDir, srcPath);
  if (!fs.existsSync(abilityDir)) return;
  validateJerryBytecodeTree(abilityDir);
}

function ensureJsAbilitySidecars(jsAbilityDir: string, jsSourceRoot: string): void {
  const manifest = path.join(jsAbilityDir, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    const srcManifest = path.join(jsSourceRoot, 'manifest.json');
    if (fs.existsSync(srcManifest)) fs.copyFileSync(srcManifest, manifest);
    else
      throw new OhjsError('BLD-FAILED', 'manifest.json missing from ace-loader output', {
        hint: jsAbilityDir,
      });
  }

  const preview = path.join(jsAbilityDir, 'preview_css.json');
  if (!fs.existsSync(preview)) {
    throw new OhjsError('BLD-FAILED', 'preview_css.json missing from ace-loader output', {
      hint: jsAbilityDir,
    });
  }

  const imageConvert = path.join(jsAbilityDir, 'image_convert_result.txt');
  if (!fs.existsSync(imageConvert)) {
    fs.writeFileSync(imageConvert, '{exitCode:0}');
  }
}

/** Resolve webpack output to `assets/js/<srcPath>/…`. */
export function stageJsAbilityTree(
  jsBuildDir: string,
  jsSourceRoot: string,
  srcPath: string,
  destAbilityDir: string,
): void {
  fs.rmSync(destAbilityDir, { recursive: true, force: true });
  fs.mkdirSync(destAbilityDir, { recursive: true });

  const webpackAbilityDir = resolveWebpackJsAbilityDir(jsBuildDir, srcPath);
  if (fs.existsSync(webpackAbilityDir)) {
    copyDir(webpackAbilityDir, destAbilityDir);
  }

  ensureJsAbilitySidecars(destAbilityDir, jsSourceRoot);
  validateJerryBytecodeTree(destAbilityDir);
}

/** DevEco-shaped `pack.info` beside the install HAP. */
export function writePackInfo(
  configPath: string,
  dest: string,
  ctx: { mainAbility: string; deviceType: string[]; moduleName: string },
): void {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const app = isObject(config['app']) ? config['app'] : {};
  const module = isObject(config['module']) ? config['module'] : {};
  const distro = isObject(module['distro']) ? module['distro'] : {};
  const apiVersion = isObject(app['apiVersion'])
    ? app['apiVersion']
    : { target: 8, compatible: 8, releaseType: 'Release' };
  const abilities = Array.isArray(module['abilities']) ? module['abilities'] : [];
  const abilitySummaries = abilities
    .filter((a) => isObject(a))
    .map((a) => ({
      name: a['name'],
      label: a['label'],
    }));

  const pack = {
    summary: {
      app: {
        bundleName: app['bundleName'],
        version: app['version'],
      },
      modules: [
        {
          mainAbility: ctx.mainAbility,
          deviceType: ctx.deviceType,
          abilities: abilitySummaries,
          distro: {
            deliveryWithInstall: distro['deliveryWithInstall'] ?? true,
            moduleName: ctx.moduleName,
            moduleType: distro['moduleType'] ?? 'entry',
          },
          apiVersion,
        },
      ],
    },
    packages: [
      {
        deviceType: ctx.deviceType,
        moduleType: distro['moduleType'] ?? 'entry',
        deliveryWithInstall: distro['deliveryWithInstall'] ?? true,
        name: `${ctx.moduleName}-default`,
      },
    ],
  };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(pack));
}

export interface FaHapPackInput {
  module: FaModuleInfo;
  jsBuildDir: string;
  jsSourceRoot: string;
  stagingRoot: string;
  hapPath: string;
  packInfoPath?: string;
  runner: IProcessRunner;
  restoolPath?: string;
}

/**
 * Stage FA HAP layout (`config.json`, `assets/js/<srcPath>/…`, `assets/entry/…`, `pack.info`) and zip.
 */
export async function packFaHap(input: FaHapPackInput): Promise<void> {
  const staging = path.join(input.stagingRoot, 'fa-hap');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const sourceConfig = JSON.parse(fs.readFileSync(input.module.configPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const layout = parseFaModuleConfig(sourceConfig);
  const entryAssets = path.join(staging, 'assets', 'entry');
  const resourceTable: FaResourceEntry[] = stageEntryResources(input.module.moduleRoot, entryAssets);
  await compileEntryResourcesIndex({
    moduleRoot: input.module.moduleRoot,
    configPath: input.module.configPath,
    bundleName: input.module.bundleName,
    entryAssetsDir: entryAssets,
    runner: input.runner,
    restoolPath: input.restoolPath,
  });

  const packaged = enrichPackagedConfig(sourceConfig, {
    mainAbility: layout.mainAbility,
    deviceType: layout.deviceType,
    resourceTable,
  });
  const configStagingPath = path.join(staging, 'config.json');
  fs.writeFileSync(configStagingPath, JSON.stringify(packaged));

  const jsDest = path.join(staging, 'assets', 'js', layout.jsSrcPath);
  stageJsAbilityTree(input.jsBuildDir, input.jsSourceRoot, layout.jsSrcPath, jsDest);

  const packInfoStaging = path.join(staging, 'pack.info');
  writePackInfo(configStagingPath, packInfoStaging, {
    mainAbility: layout.mainAbility,
    deviceType: layout.deviceType,
    moduleName: input.module.moduleName,
  });

  await packStagingToHap(staging, input.hapPath);

  if (input.packInfoPath) {
    fs.mkdirSync(path.dirname(input.packInfoPath), { recursive: true });
    fs.copyFileSync(packInfoStaging, input.packInfoPath);
  }
}
