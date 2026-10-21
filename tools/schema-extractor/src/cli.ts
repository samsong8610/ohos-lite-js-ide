#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseSourcesConfig } from './config';
import { runCheck, runGenerate } from './run';

function main(argv: string[]): number {
  const cmd = argv[0];
  const root = path.resolve(__dirname, '..');
  const cfgPath = path.join(root, 'sources.json');
  const outDir = path.resolve(root, '../../packages/schemas');
  if (cmd !== 'generate' && cmd !== 'check') {
    console.error('usage: schema-extractor <generate|check>');
    return 2;
  }
  const cfg = parseSourcesConfig(fs.readFileSync(cfgPath, 'utf8'), process.env);
  const log = (m: string): void => console.log(`[schema-extractor] ${m}`);
  const r = cmd === 'generate' ? runGenerate(cfg, outDir, log) : runCheck(cfg, outDir, log);
  for (const s of r.skipped) console.warn(`[schema-extractor] WARNING skipped ${s}`);
  if (cmd === 'generate') for (const f of r.files) log(`wrote packages/schemas/${f}`);
  for (const e of r.errors) console.error(`[schema-extractor] ERROR ${e}`);
  if (cmd === 'check' && !r.errors.length)
    log(r.skipped.length ? 'check passed for available sources' : 'schemas up to date');
  return r.errors.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
