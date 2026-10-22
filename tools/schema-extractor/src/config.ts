/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import type { SourceSet } from './generate';

export interface SourcesConfig {
  versions: SourceSet[];
  diff: Array<{ from: string; to: string }>;
}

/** Expands `${VAR}` and `${VAR:-default}`. Unset variables without default are an error. */
export function expandVars(s: string, env: Record<string, string | undefined>): string {
  return s.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_m, name: string, def: string | undefined) => {
      const v = env[name];
      if (v !== undefined && v !== '') return v;
      if (def !== undefined) return def;
      throw new Error(`environment variable ${name} is not set`);
    },
  );
}

export function parseSourcesConfig(text: string, env: Record<string, string | undefined>): SourcesConfig {
  const raw = JSON.parse(text) as { versions?: unknown; diff?: unknown };
  if (!Array.isArray(raw.versions) || raw.versions.length === 0)
    throw new Error('sources.json: "versions" must be a non-empty array');
  const versions = raw.versions.map((v: Record<string, unknown>, i: number): SourceSet => {
    for (const k of ['ohVersion', 'target', 'engine', 'loader', 'docs']) {
      if (typeof v[k] !== 'string') throw new Error(`sources.json: versions[${i}].${k} must be a string`);
    }
    const set: SourceSet = {
      ohVersion: v['ohVersion'] as string,
      provisional: v['provisional'] === true,
      target: v['target'] as string,
      engine: expandVars(v['engine'] as string, env),
      loader: expandVars(v['loader'] as string, env),
      docs: expandVars(v['docs'] as string, env),
    };
    if (typeof v['provisionalReason'] === 'string') set.provisionalReason = v['provisionalReason'];
    if (typeof v['jerryscript'] === 'string') set.jerryscript = expandVars(v['jerryscript'], env);
    return set;
  });
  const diff = Array.isArray(raw.diff) ? (raw.diff as Array<{ from: string; to: string }>) : [];
  for (const d of diff) {
    if (!versions.some((v) => v.ohVersion === d.from) || !versions.some((v) => v.ohVersion === d.to)) {
      throw new Error(`sources.json: diff ${d.from} → ${d.to} references an unknown version`);
    }
  }
  return { versions, diff };
}

export function missingSources(set: SourceSet): string[] {
  return [set.engine, set.loader, set.docs, ...(set.jerryscript ? [set.jerryscript] : [])].filter(
    (p) => !fs.existsSync(p),
  );
}
