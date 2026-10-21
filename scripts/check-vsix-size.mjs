/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Usage: node scripts/check-vsix-size.mjs <dir> <maxMB>
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir = '.', maxMb = '20'] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.vsix'));
if (files.length === 0) {
  console.error(`no .vsix found in ${dir}`);
  process.exit(1);
}
let failed = false;
for (const f of files) {
  const mb = statSync(join(dir, f)).size / 1024 / 1024;
  const ok = mb <= Number(maxMb);
  failed ||= !ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${f}: ${mb.toFixed(2)} MB (limit ${maxMb} MB)`);
}
process.exit(failed ? 1 : 0);
