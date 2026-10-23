/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';

export interface AceLoaderInstall {
  /** ace-loader checkout root (contains webpack.lite.config.js). */
  root: string;
  webpackConfig: string;
  webpackCli: string;
}

export interface AceLoaderDiscoveryOptions {
  workspaceRoot: string;
  aceLoaderMain?: string;
  aceLoaderPath?: string;
}

function existsFile(p: string | undefined): p is string {
  if (!p) return false;
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readToolchain(workspaceRoot: string): { aceLoaderMain?: string; aceLoaderRoot?: string } {
  const tc = path.join(workspaceRoot, '.ohjs', 'toolchain.json');
  if (!fs.existsSync(tc)) return {};
  try {
    return JSON.parse(fs.readFileSync(tc, 'utf8')) as { aceLoaderMain?: string; aceLoaderRoot?: string };
  } catch {
    return {};
  }
}

function findAceLoaderRoot(start: string): string | undefined {
  let dir = existsFile(start) ? path.dirname(start) : path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'webpack.lite.config.js'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function resolveRoot(candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (!c) continue;
    const found = findAceLoaderRoot(c);
    if (found) return found;
  }
  return undefined;
}

/** FR-BLD-002 discovery: opts → env → toolchain → workspace setting path. */
export function resolveAceLoaderInstall(opts: AceLoaderDiscoveryOptions): AceLoaderInstall | undefined {
  const tc = readToolchain(opts.workspaceRoot);
  const root = resolveRoot([
    opts.aceLoaderMain,
    process.env.OHJS_ACE_LOADER_MAIN,
    tc.aceLoaderMain,
    tc.aceLoaderRoot,
    opts.aceLoaderPath,
    process.env.OHJS_ACE_LOADER_ROOT,
  ]);
  if (!root) return undefined;

  const webpackConfig = path.join(root, 'webpack.lite.config.js');
  if (!fs.existsSync(webpackConfig)) return undefined;

  const stubCli = path.join(root, 'stub-webpack.js');
  const upstreamCli = path.join(root, 'node_modules', 'webpack', 'bin', 'webpack.js');
  const webpackCli = fs.existsSync(stubCli) ? stubCli : upstreamCli;
  if (!fs.existsSync(webpackCli)) return undefined;

  return { root, webpackConfig, webpackCli };
}

export function aceLoaderConfigured(opts: AceLoaderDiscoveryOptions): boolean {
  return resolveAceLoaderInstall(opts) !== undefined;
}
