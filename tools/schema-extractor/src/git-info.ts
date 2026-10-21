/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';

export interface GitInfo {
  commit?: string;
  tags: string[];
  remote?: string;
}

/** Reads HEAD commit, tags pointing at it and origin URL straight from .git (no git process). */
export function readGitInfo(repoDir: string): GitInfo {
  const gitDir = path.join(repoDir, '.git');
  if (!fs.existsSync(gitDir)) return { tags: [] };
  const read = (p: string): string | undefined => {
    const f = path.join(gitDir, p);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : undefined;
  };
  const packed = read('packed-refs') ?? '';
  const resolveRef = (ref: string): string | undefined => {
    const loose = read(ref)?.trim();
    if (loose) return loose;
    const m = new RegExp(`^([0-9a-f]{40}) ${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').exec(packed);
    return m?.[1];
  };
  const head = read('HEAD')?.trim();
  const commit = head?.startsWith('ref: ') ? resolveRef(head.slice(5)) : head;
  const tags = new Set<string>();
  if (commit) {
    let last: string | undefined;
    for (const line of packed.split('\n')) {
      const m = /^([0-9a-f]{40}) refs\/tags\/(.+)$/.exec(line);
      if (m) {
        last = m[2];
        if (m[1] === commit) tags.add(m[2]!);
      } else if (line.startsWith('^') && line.slice(1).trim() === commit && last) tags.add(last);
    }
    const tagDir = path.join(gitDir, 'refs', 'tags');
    if (fs.existsSync(tagDir)) {
      for (const t of fs.readdirSync(tagDir)) if (read(`refs/tags/${t}`)?.trim() === commit) tags.add(t);
    }
  }
  const remote = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(read('config') ?? '')?.[1];
  return { ...(commit ? { commit } : {}), tags: [...tags].sort(), ...(remote ? { remote } : {}) };
}
