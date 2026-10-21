/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  validateComponentsFile,
  validateSystemModulesFile,
  versionDirName,
  type ComponentsSchemaFile,
} from '@ohjs/schemas';
import { missingSources, type SourcesConfig } from './config';
import { diffSchemas, renderDiffMarkdown } from './diff';
import { generateSchema, generateSystemModules } from './generate';

export interface RunResult {
  /** files written (generate) or found stale (check) */
  files: string[];
  skipped: string[];
  errors: string[];
}

export function serialize(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

/** Produces every output file in memory: `<version>/components.json`, diff reports and sources.lock.json. */
export function buildOutputs(
  cfg: SourcesConfig,
  log: (m: string) => void = () => {},
): { outputs: Map<string, string>; skipped: string[] } {
  const outputs = new Map<string, string>();
  const skipped: string[] = [];
  const schemas = new Map<string, ComponentsSchemaFile>();
  for (const set of cfg.versions) {
    const missing = missingSources(set);
    if (missing.length) {
      skipped.push(`${set.ohVersion}: missing ${missing.join(', ')}`);
      continue;
    }
    const schema = generateSchema(set);
    const v = validateComponentsFile(schema);
    if (!v.valid) throw new Error(`generated schema for ${set.ohVersion} is invalid: ${v.errors.join('; ')}`);
    log(
      `${set.ohVersion}: ${Object.keys(schema.components).length} components, ${schema.warnings.length} warnings`,
    );
    schemas.set(set.ohVersion, schema);
    outputs.set(`${versionDirName(set.ohVersion)}/components.json`, serialize(schema));
    const modules = generateSystemModules(set);
    const mv = validateSystemModulesFile(modules);
    if (!mv.valid)
      throw new Error(`generated system modules for ${set.ohVersion} are invalid: ${mv.errors.join('; ')}`);
    outputs.set(`${versionDirName(set.ohVersion)}/system-modules.json`, serialize(modules));
  }
  for (const d of cfg.diff) {
    const a = schemas.get(d.from);
    const b = schemas.get(d.to);
    if (!a || !b) {
      skipped.push(`diff ${d.from} → ${d.to}: a side was skipped`);
      continue;
    }
    outputs.set(
      `diff-${versionDirName(d.from).slice(1)}-${versionDirName(d.to).slice(1)}.md`,
      renderDiffMarkdown(diffSchemas(a, b), a, b),
    );
  }
  if (schemas.size === cfg.versions.length) {
    const lock = Object.fromEntries(
      [...schemas].map(([ver, s]) => [
        ver,
        s.sources.map(({ repo, commit, tags, remote }) => ({ repo, commit, tags, remote })),
      ]),
    );
    outputs.set('sources.lock.json', serialize(lock));
  }
  return { outputs, skipped };
}

export function runGenerate(
  cfg: SourcesConfig,
  outDir: string,
  log: (m: string) => void = () => {},
): RunResult {
  const { outputs, skipped } = buildOutputs(cfg, log);
  const files: string[] = [];
  for (const [rel, text] of outputs) {
    const p = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    files.push(rel);
  }
  return { files, skipped, errors: [] };
}

/** Regenerates in memory and compares with the committed files. Missing sources skip (with warning) rather than fail. */
export function runCheck(cfg: SourcesConfig, outDir: string, log: (m: string) => void = () => {}): RunResult {
  const { outputs, skipped } = buildOutputs(cfg, log);
  const files: string[] = [];
  const errors: string[] = [];
  for (const [rel, text] of outputs) {
    const p = path.join(outDir, rel);
    if (!fs.existsSync(p)) errors.push(`${rel}: missing (run pnpm schema:generate)`);
    else if (fs.readFileSync(p, 'utf8') !== text) {
      files.push(rel);
      errors.push(`${rel}: out of date (run pnpm schema:generate)`);
    }
  }
  return { files, skipped, errors };
}
