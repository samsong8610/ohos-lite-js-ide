/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type IProcessRunner } from '@ohjs/core';
import { runRestoolCompile } from './lite-restool';

export type FaResourceKind = 'string' | 'media';

export interface FaResourceEntry {
  kind: FaResourceKind;
  name: string;
  /** DevEco-style id (e.g. 0x01000000). */
  id: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readStringJson(filePath: string): { name: string }[] {
  if (!fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!isObject(json) || !Array.isArray(json['string'])) return [];
  const out: { name: string }[] = [];
  for (const item of json['string']) {
    if (isObject(item) && typeof item['name'] === 'string') out.push({ name: item['name'] });
  }
  return out;
}

function listMediaNames(mediaDir: string): string[] {
  if (!fs.existsSync(mediaDir)) return [];
  return fs
    .readdirSync(mediaDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.parse(e.name).name)
    .sort();
}

/** Collect FA lite base resources (strings + media) in DevEco ResourceTable order. */
export function collectFaResourceTable(moduleRoot: string): FaResourceEntry[] {
  const base = path.join(moduleRoot, 'src', 'main', 'resources', 'base');
  const strings = readStringJson(path.join(base, 'element', 'string.json'));
  strings.sort((a, b) => a.name.localeCompare(b.name));
  const media = listMediaNames(path.join(base, 'media'));
  const entries: FaResourceEntry[] = [];
  let nextId = 0x0100_0000;
  for (const s of strings) {
    entries.push({ kind: 'string', name: s.name, id: nextId++ });
  }
  for (const name of media) {
    entries.push({ kind: 'media', name, id: nextId++ });
  }
  return entries;
}

export function resourceTableFingerprint(entries: FaResourceEntry[]): string {
  return entries.map((e) => `${e.kind}:${e.name}`).join('|');
}

export function lookupResourceId(
  entries: FaResourceEntry[],
  kind: FaResourceKind,
  name: string,
): number | undefined {
  return entries.find((e) => e.kind === kind && e.name === name)?.id;
}

function refName(ref: string, prefix: string): string | undefined {
  if (!ref.startsWith(prefix)) return undefined;
  return ref.slice(prefix.length);
}

/** Patch packaged `config.json` with apiVersion, mainAbility, virtualMachine, and resource ids. */
export function enrichPackagedConfig(
  source: Record<string, unknown>,
  ctx: {
    mainAbility: string;
    deviceType: string[];
    resourceTable: FaResourceEntry[];
  },
): Record<string, unknown> {
  const app = isObject(source['app']) ? { ...source['app'] } : {};
  if (!isObject(app['apiVersion'])) {
    app['apiVersion'] = { compatible: 8, releaseType: 'Release', target: 8 };
  }
  const module = isObject(source['module']) ? { ...source['module'] } : {};
  const distro = isObject(module['distro']) ? { ...module['distro'] } : {};
  if (typeof distro['virtualMachine'] !== 'string') {
    distro['virtualMachine'] = 'ark0.0.0.2';
  }
  module['distro'] = distro;
  module['mainAbility'] = ctx.mainAbility;
  module['package'] = null;

  const abilities = Array.isArray(module['abilities']) ? [...module['abilities']] : [];
  module['abilities'] = abilities.map((raw) => {
    if (!isObject(raw)) return raw;
    const a = { ...raw };
    const desc = typeof a['description'] === 'string' ? refName(a['description'], '$string:') : undefined;
    const label = typeof a['label'] === 'string' ? refName(a['label'], '$string:') : undefined;
    const icon = typeof a['icon'] === 'string' ? refName(a['icon'], '$media:') : undefined;
    if (desc) {
      const id = lookupResourceId(ctx.resourceTable, 'string', desc);
      if (id !== undefined) a['descriptionId'] = id;
    }
    if (label) {
      const id = lookupResourceId(ctx.resourceTable, 'string', label);
      if (id !== undefined) a['labelId'] = id;
    }
    if (icon) {
      const id = lookupResourceId(ctx.resourceTable, 'media', icon);
      if (id !== undefined) a['iconId'] = id;
    }
    return a;
  });

  if (!Array.isArray(module['deviceType']) || module['deviceType'].length === 0) {
    module['deviceType'] = ctx.deviceType;
  }

  return { ...source, app, module, deviceConfig: source['deviceConfig'] ?? {} };
}

export function stageEntryResources(moduleRoot: string, entryAssetsRoot: string): FaResourceEntry[] {
  const table = collectFaResourceTable(moduleRoot);
  const resourcesDst = path.join(entryAssetsRoot, 'resources');
  fs.mkdirSync(resourcesDst, { recursive: true });
  const mediaSrc = path.join(moduleRoot, 'src', 'main', 'resources', 'base', 'media');
  const mediaDst = path.join(resourcesDst, 'base', 'media');
  if (fs.existsSync(mediaSrc)) {
    copyDir(mediaSrc, mediaDst);
  }
  return table;
}

export async function compileEntryResourcesIndex(input: {
  moduleRoot: string;
  configPath: string;
  bundleName: string;
  entryAssetsDir: string;
  runner: IProcessRunner;
  restoolPath?: string;
}): Promise<void> {
  const table = collectFaResourceTable(input.moduleRoot);
  if (table.length === 0) {
    throw new OhjsError('BLD-FAILED', 'Cannot compile resources.index: module has no lite resources', {
      hint: input.moduleRoot,
    });
  }
  await runRestoolCompile({
    moduleRoot: input.moduleRoot,
    configPath: input.configPath,
    bundleName: input.bundleName,
    entryAssetsDir: input.entryAssetsDir,
    runner: input.runner,
    restoolPath: input.restoolPath,
  });
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
