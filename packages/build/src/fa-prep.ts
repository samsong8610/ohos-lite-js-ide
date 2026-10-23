/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError } from '@ohjs/core';
import { parseFaModuleConfig } from './project-info';

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

/** FA lite JS sources live under `src/main/js/<srcPath>/` (DevEco `srcPath`, else `default`). */
export function findJsSourceRoot(moduleRoot: string, configPath?: string): string {
  const jsRoot = path.join(moduleRoot, 'src', 'main', 'js');
  if (!fs.existsSync(jsRoot)) {
    throw new OhjsError('BLD-FAILED', `Missing src/main/js under ${moduleRoot}`);
  }
  if (configPath && fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const layout = parseFaModuleConfig(config);
    const fromSrcPath = path.join(jsRoot, layout.jsSrcPath);
    if (fs.existsSync(fromSrcPath)) return fromSrcPath;
  }
  const preferred = path.join(jsRoot, 'default');
  if (fs.existsSync(preferred)) return preferred;
  const children = fs.readdirSync(jsRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (children.length === 0) throw new OhjsError('BLD-FAILED', `No JS profile folder under ${jsRoot}`);
  return path.join(jsRoot, children[0]!.name);
}

/**
 * Prepare an ace-loader `aceModuleRoot`: copy JS tree and add manifest.json + app.js when absent.
 */
export function prepareAceModuleRoot(
  moduleRoot: string,
  configPath: string,
  outDir: string,
): { aceModuleRoot: string; aceManifestPath: string; jsSrcPath: string } {
  const srcJs = findJsSourceRoot(moduleRoot, configPath);
  const aceModuleRoot = path.join(outDir, 'ace-module-root');
  fs.rmSync(aceModuleRoot, { recursive: true, force: true });
  copyDir(srcJs, aceModuleRoot);

  const aceManifestPath = path.join(aceModuleRoot, 'manifest.json');
  if (!fs.existsSync(aceManifestPath)) {
    const configText = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configText) as Record<string, unknown>;
    const module = config['module'];
    let pages: string[] = ['pages/index/index'];
    if (isObject(module) && Array.isArray(module['js'])) {
      const js0 = module['js'][0];
      if (isObject(js0) && Array.isArray(js0['pages']) && js0['pages'].every((p) => typeof p === 'string')) {
        pages = js0['pages'] as string[];
      }
    }
    const app = isObject(config['app']) ? config['app'] : {};
    const version = isObject(app['version']) ? app['version'] : {};
    const layout = parseFaModuleConfig(config);
    const js0 = isObject(module) && Array.isArray(module['js']) ? module['js'][0] : undefined;
    const abilityName =
      js0 && isObject(js0) && typeof js0['name'] === 'string' ? js0['name'] : layout.mainAbility;
    fs.writeFileSync(
      aceManifestPath,
      JSON.stringify({
        appID: app['bundleName'],
        versionName: version['name'] ?? '1.0.0',
        versionCode: version['code'] ?? 1,
        minPlatformVersion: 8,
        appName: '$string:MainAbility_label',
        deviceType: layout.deviceType,
        pages,
      }),
    );
  }

  const appJs = path.join(aceModuleRoot, 'app.js');
  if (!fs.existsSync(appJs)) {
    fs.writeFileSync(appJs, 'export default {\n  onCreate() {},\n  onDestroy() {},\n};\n');
  }

  const layout = parseFaModuleConfig(
    JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>,
  );
  return { aceModuleRoot, aceManifestPath, jsSrcPath: layout.jsSrcPath };
}
