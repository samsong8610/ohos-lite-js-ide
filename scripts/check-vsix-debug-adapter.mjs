/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Usage: node scripts/check-vsix-debug-adapter.mjs [extensionDir]
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const extDir = process.argv[2] ?? 'packages/extension';
const vsixFiles = readdirSync(extDir).filter((f) => f.endsWith('.vsix'));
if (vsixFiles.length === 0) {
  console.error(`check-vsix-debug-adapter: no .vsix in ${extDir}`);
  process.exit(1);
}

const required = 'extension/dist/debugAdapter.js';
let failed = false;

for (const vsix of vsixFiles) {
  const vsixPath = join(extDir, vsix);
  let listed;
  try {
    listed = execFileSync('unzip', ['-l', vsixPath], { encoding: 'utf8' });
  } catch {
    console.error(`check-vsix-debug-adapter: unzip -l failed for ${vsix}`);
    failed = true;
    continue;
  }
  const ok = listed.includes(required);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${vsix}: ${ok ? 'contains' : 'missing'} ${required}`);
  failed ||= !ok;
}

process.exit(failed ? 1 : 0);
