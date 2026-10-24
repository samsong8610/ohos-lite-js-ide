/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';

export interface CleanBuildOutputsResult {
  /** Absolute paths that existed and were removed. */
  removed: string[];
}

function findAllConfigJsonPaths(workspaceRoot: string): string[] {
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
  return candidates;
}

/** Workspace-relative build intermediates safe to delete (not sources or toolchain cache). */
export function listCleanBuildOutputPaths(workspaceRoot: string): string[] {
  const root = path.resolve(workspaceRoot);
  const paths = new Set<string>();
  paths.add(path.join(root, '.ohjs', 'build'));
  for (const configPath of findAllConfigJsonPaths(root)) {
    const moduleRoot = configPath.replace(/[/\\]src[/\\]main[/\\]config\.json$/i, '');
    paths.add(path.join(moduleRoot, 'build'));
  }
  return [...paths].sort();
}

/** Removes build staging under `.ohjs/build` and each module's `build/` tree. No-op when absent. */
export function cleanBuildOutputs(workspaceRoot: string): CleanBuildOutputsResult {
  const removed: string[] = [];
  for (const target of listCleanBuildOutputPaths(workspaceRoot)) {
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  return { removed };
}
