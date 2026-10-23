/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OhjsError } from '@ohjs/core';

export interface FaModuleInfo {
  bundleName: string;
  abilityName: string;
  moduleName: string;
  configPath: string;
  /** Directory containing `src/main/config.json` (module root). */
  moduleRoot: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Reads FA `config.json` for deploy identity (bundle + default ability). */
export function parseFaConfigJson(text: string, configPath: string): FaModuleInfo {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new OhjsError('BLD-FAILED', `Invalid config.json: ${(e as Error).message}`, { hint: configPath });
  }
  if (!isObject(json)) throw new OhjsError('BLD-FAILED', 'config.json root must be an object');
  const app = json['app'];
  const module = json['module'];
  if (!isObject(app) || typeof app['bundleName'] !== 'string') {
    throw new OhjsError('BLD-FAILED', 'config.json app.bundleName is required');
  }
  if (!isObject(module)) throw new OhjsError('BLD-FAILED', 'config.json module object is required');
  const abilities = module['abilities'];
  let abilityName = 'default';
  if (Array.isArray(abilities)) {
    const jsAbility = abilities.find((a) => isObject(a) && a['srcLanguage'] === 'js');
    if (jsAbility && isObject(jsAbility) && typeof jsAbility['name'] === 'string') {
      abilityName = jsAbility['name'];
    }
  }
  const moduleName =
    (isObject(module['distro']) && typeof module['distro']['moduleName'] === 'string'
      ? module['distro']['moduleName']
      : undefined) ?? 'entry';
  const moduleRoot = configPath.replace(/[/\\]src[/\\]main[/\\]config\.json$/i, '');
  return {
    bundleName: app['bundleName'],
    abilityName,
    moduleName,
    configPath,
    moduleRoot,
  };
}
