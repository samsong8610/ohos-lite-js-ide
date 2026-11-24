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

const RETRYABLE_RM = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM', 'EACCES']);

/**
 * Windows `fs.rmSync` often throws `ENOTEMPTY` after the directory is already gone
 * (or while a file lock is dropping). Retry, and treat a missing path as success.
 */
export function removeBuildTree(
  target: string,
  fsOps: { rmSync: typeof fs.rmSync; existsSync: typeof fs.existsSync } = fs,
): void {
  const opts: fs.RmOptions = { recursive: true, force: true, maxRetries: 5, retryDelay: 50 };
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fsOps.rmSync(target, opts);
      return;
    } catch (e) {
      last = e;
      const code = (e as NodeJS.ErrnoException).code;
      if (!code || !RETRYABLE_RM.has(code)) throw e;
      if (!fsOps.existsSync(target)) return;
    }
  }
  if (!fsOps.existsSync(target)) return;
  throw last;
}

/** Removes build staging under `.ohjs/build` and each module's `build/` tree. No-op when absent. */
export function cleanBuildOutputs(workspaceRoot: string): CleanBuildOutputsResult {
  const removed: string[] = [];
  for (const target of listCleanBuildOutputPaths(workspaceRoot)) {
    if (!fs.existsSync(target)) continue;
    removeBuildTree(target);
    removed.push(target);
  }
  return { removed };
}
