/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});
// JSON schema for jsonValidation is generated from the single source of truth in @ohjs/core (needs tsc -b first)
const { DEVICE_PROFILE_JSON_SCHEMA } = require('@ohjs/core');
mkdirSync('dist/schemas', { recursive: true });
writeFileSync(
  'dist/schemas/device-profile.schema.json',
  JSON.stringify(DEVICE_PROFILE_JSON_SCHEMA, null, 2) + '\n',
);

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
