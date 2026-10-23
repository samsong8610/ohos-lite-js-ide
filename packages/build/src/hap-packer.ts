/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import type { FaModuleInfo } from './project-info';
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

/** Minimal FA `pack.info` for deploy tooling (bundle/module summary). */
export function writePackInfo(configPath: string, dest: string): void {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const app = isObject(config['app']) ? config['app'] : {};
  const module = isObject(config['module']) ? config['module'] : {};
  const distro = isObject(module['distro']) ? module['distro'] : {};
  const pack = {
    summary: {
      app: {
        bundleName: app['bundleName'],
        version: app['version'],
      },
      modules: [
        {
          name: distro['moduleName'] ?? module['name'],
          type: distro['moduleType'],
          abilities: module['abilities'],
        },
      ],
    },
    packages: [],
  };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(pack, null, 2));
}

export interface FaHapPackInput {
  module: FaModuleInfo;
  jsBuildDir: string;
  stagingRoot: string;
  hapPath: string;
}

/**
 * Stage FA HAP layout (`config.json`, `assets/js/…`, `assets/entry/…`, `pack.info`) and zip.
 */
export async function packFaHap(input: FaHapPackInput): Promise<void> {
  const staging = path.join(input.stagingRoot, 'fa-hap');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  fs.copyFileSync(input.module.configPath, path.join(staging, 'config.json'));
  writePackInfo(input.module.configPath, path.join(staging, 'pack.info'));

  const assetsJs = path.join(staging, 'assets', 'js');
  fs.mkdirSync(assetsJs, { recursive: true });
  if (fs.existsSync(input.jsBuildDir)) {
    copyDir(input.jsBuildDir, assetsJs);
  }

  const resourcesSrc = path.join(input.module.moduleRoot, 'src', 'main', 'resources');
  const entryResources = path.join(staging, 'assets', 'entry', 'resources');
  if (fs.existsSync(resourcesSrc)) {
    copyDir(resourcesSrc, entryResources);
  } else {
    fs.mkdirSync(entryResources, { recursive: true });
  }

  await packStagingToHap(staging, input.hapPath);
}
