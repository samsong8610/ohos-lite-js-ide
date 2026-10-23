/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, ToolLocator, type CommandSpec, type IPlatform, type IProcessRunner } from '@ohjs/core';
import { runFixtureBuild } from './fixture-backend';
import { parseFaConfigJson } from './project-info';
import type { BuildResult } from './types';

export type BuildBackendKind = 'auto' | 'fixture' | 'ace-loader';

export interface BuildOptions {
  workspaceRoot: string;
  outDir?: string;
  backend?: BuildBackendKind;
  /** When set, run `node <aceLoaderMain>` with module root as cwd (upstream ace-loader CLI). */
  aceLoaderMain?: string;
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
  const aceMain =
    opts.aceLoaderMain ?? process.env.OHJS_ACE_LOADER_MAIN ?? tryAceLoaderFromToolchain(opts.workspaceRoot);

  if ((backend === 'ace-loader' || backend === 'auto') && aceMain && fs.existsSync(aceMain)) {
    const hapPath = path.join(outDir, `${module.moduleName}.hap`);
    fs.mkdirSync(outDir, { recursive: true });
    const node = new ToolLocator(platform).locate('node').path;
    const cmd: CommandSpec = {
      file: node,
      args: [aceMain, '--module', module.moduleRoot, '--output', hapPath],
    };
    const r = await runner.run({ ...cmd, cwd: module.moduleRoot }, { timeoutMs: 600000 });
    if (r.exitCode !== 0 || !fs.existsSync(hapPath)) {
      if (backend === 'ace-loader') {
        throw new OhjsError('BLD-FAILED', `ace-loader failed: ${r.stderr || r.stdout}`, {
          exitCode: r.exitCode,
        });
      }
    } else {
      return { hapPath, module, backend: 'ace-loader' };
    }
  }

  if (backend === 'ace-loader') {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      'ace-loader backend requested but OHJS_ACE_LOADER_MAIN is not set',
    );
  }

  return runFixtureBuild(platform, module, outDir);
}

function tryAceLoaderFromToolchain(workspaceRoot: string): string | undefined {
  const tc = path.join(workspaceRoot, '.ohjs', 'toolchain.json');
  if (!fs.existsSync(tc)) return undefined;
  try {
    const j = JSON.parse(fs.readFileSync(tc, 'utf8')) as { aceLoaderMain?: string };
    return j.aceLoaderMain;
  } catch {
    return undefined;
  }
}
