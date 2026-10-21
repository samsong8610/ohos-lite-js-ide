/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// language server runs in its own Node process (ARCHITECTURE §2.2); bundled from the compiled package
const serverEntry = require.resolve('@ohjs/language-server/out/main.js');
const serverCtx = await esbuild.context({
  entryPoints: [serverEntry],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server.js',
  // jsonc-parser's "main" is a UMD build with runtime require('./impl/…') that esbuild cannot follow
  mainFields: ['module', 'main'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});
// versioned component schema data packs, read by the server at runtime (dist/schemas/components/v*/components.json)
const schemasRoot = dirname(require.resolve('@ohjs/schemas/package.json'));
rmSync('dist/schemas/components', { recursive: true, force: true });
for (const d of readdirSync(schemasRoot)) {
  const src = join(schemasRoot, d, 'components.json');
  if (/^v\d/.test(d) && existsSync(src)) {
    mkdirSync(join('dist/schemas/components', d), { recursive: true });
    cpSync(src, join('dist/schemas/components', d, 'components.json'));
    const mods = join(schemasRoot, d, 'system-modules.json');
    if (existsSync(mods)) cpSync(mods, join('dist/schemas/components', d, 'system-modules.json'));
  }
}

// the language client is its own bundle, required on demand after project detection (keeps
// dist/extension.js — parsed on every activation — small)
const clientCtx = await esbuild.context({
  entryPoints: ['src/language-client.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/client.js',
  // jsonc-parser (via types-gen) ships a UMD main whose relative requires break when bundled
  mainFields: ['module', 'main'],
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

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
  await Promise.all([ctx.watch(), clientCtx.watch(), serverCtx.watch()]);
} else {
  await Promise.all([ctx.rebuild(), clientCtx.rebuild(), serverCtx.rebuild()]);
  await Promise.all([ctx.dispose(), clientCtx.dispose(), serverCtx.dispose()]);
}
