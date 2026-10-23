/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sourceNameMatches } from '@ohjs/jerry-debug-client';

/** Map a Jerry `sourceName` to a workspace file path when possible. */
export function resolveLocalSourcePath(
  jerrySourceName: string,
  workspaceFolder: string | undefined,
  cache: Map<string, string | undefined>,
): string | undefined {
  if (!workspaceFolder) return undefined;
  const key = `${workspaceFolder}\0${jerrySourceName}`;
  if (cache.has(key)) return cache.get(key);

  const norm = jerrySourceName.replace(/\\/g, '/');
  if (path.isAbsolute(norm) && fs.existsSync(norm)) {
    cache.set(key, norm);
    return norm;
  }

  const base = path.basename(norm);
  let found: string | undefined;
  const walk = (dir: string, depth: number): void => {
    if (found || depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.ohjs') continue;
      const full = path.join(dir, e.name);
      if (e.isFile() && (e.name === base || sourceNameMatches(jerrySourceName, full.replace(/\\/g, '/')))) {
        found = full;
        return;
      }
      if (e.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(workspaceFolder, 0);
  cache.set(key, found);
  return found;
}

/** DAP path for breakpoints: use basename for Jerry when the file lives under the workspace. */
export function breakpointSourceName(filePath: string, workspaceFolder: string | undefined): string {
  if (workspaceFolder && filePath.startsWith(workspaceFolder)) {
    return path.basename(filePath);
  }
  return filePath.replace(/\\/g, '/');
}
