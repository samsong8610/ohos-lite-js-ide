/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type IPlatform, type IProcessRunner } from '@ohjs/core';
import { aceLoaderConfigured } from './ace-loader-config';
import {
  aceLoaderProvisionRoot,
  ensureAceLoaderInstall,
  type AceLoaderProvisionerDeps,
} from './ace-loader-provision';
import { runAceLoaderBuild } from './ace-loader-backend';
import { runFixtureBuild } from './fixture-backend';
import { parseFaConfigJson } from './project-info';
import type { BuildResult } from './types';

export type BuildBackendKind = 'auto' | 'fixture' | 'ace-loader';

export interface BuildOptions {
  workspaceRoot: string;
  outDir?: string;
  backend?: BuildBackendKind;
  /** Legacy marker / path into ace-loader checkout (see toolchain `aceLoaderRoot`). */
  aceLoaderMain?: string;
  /** VS Code `ohjs.build.aceLoaderPath` — ace-loader root with webpack.lite.config.js */
  aceLoaderPath?: string;
  /** VS Code `ohjs.tools.restoolPath` — OpenHarmony SDK restool (overrides OHJS_RESTOOL when set). */
  restoolPath?: string;
  /** When set, auto-download pinned ace-loader into this directory (extension globalStorage). */
  aceLoaderStorageRoot?: string;
  aceLoaderAutoProvision?: boolean;
  onBuildProgress?: (message: string) => void;
  aceLoaderProvisionDeps?: AceLoaderProvisionerDeps;
}

export function findConfigJson(workspaceRoot: string): string | undefined {
  const candidates: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'out' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (
        e.name === 'config.json' &&
        full.includes(`${path.sep}src${path.sep}main${path.sep}config.json`)
      ) {
        candidates.push(full);
      }
    }
  };
  walk(workspaceRoot, 0);
  return candidates.sort((a, b) => a.length - b.length)[0];
}

export async function buildProject(
  platform: IPlatform,
  runner: IProcessRunner,
  opts: BuildOptions,
): Promise<BuildResult> {
  const configPath = findConfigJson(opts.workspaceRoot);
  if (!configPath) throw new OhjsError('BLD-NO-PROJECT', 'No src/main/config.json found in workspace');
  const text = fs.readFileSync(configPath, 'utf8');
  const module = parseFaConfigJson(text, configPath);
  const outDir = opts.outDir ?? path.join(opts.workspaceRoot, '.ohjs', 'build');
  const backend = opts.backend ?? (process.env.OHJS_BUILD_BACKEND as BuildBackendKind | undefined) ?? 'auto';

  const discovery = {
    workspaceRoot: opts.workspaceRoot,
    aceLoaderMain: opts.aceLoaderMain,
    aceLoaderPath: opts.aceLoaderPath,
    aceLoaderAutoRoot: opts.aceLoaderStorageRoot
      ? aceLoaderProvisionRoot(opts.aceLoaderStorageRoot)
      : undefined,
  };

  if (backend === 'ace-loader' || backend === 'auto') {
    if (opts.aceLoaderAutoProvision && opts.aceLoaderStorageRoot) {
      await ensureAceLoaderInstall(platform, runner, {
        ...discovery,
        storageRoot: opts.aceLoaderStorageRoot,
        provision: true,
        onProgress: opts.onBuildProgress,
        deps: opts.aceLoaderProvisionDeps,
      });
    }
    if (aceLoaderConfigured(discovery)) {
      try {
        return await runAceLoaderBuild(platform, runner, module, {
          ...discovery,
          outDir,
          restoolPath: opts.restoolPath,
        });
      } catch (e) {
        if (backend === 'ace-loader') throw e;
        if (e instanceof OhjsError && e.code === 'BLD-TOOL-MISSING') throw e;
        // auto: fall back to fixture when webpack/pack fails (same as legacy ace-loader CLI stub).
      }
    }
  }

  if (backend === 'ace-loader') {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      'ace-loader backend requested but ace-loader was not found (set OHJS_ACE_LOADER_MAIN, .ohjs/toolchain.json, or ohjs.build.aceLoaderPath)',
    );
  }

  return runFixtureBuild(platform, module, outDir);
}
