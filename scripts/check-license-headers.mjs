/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Verifies every first-party source file carries an Apache-2.0 header (PLAN §3 规范).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EXT = /\.(ts|mts|cts|js|mjs|cjs)$/;
const SKIP = /(^|\/)(node_modules|out|out-test|dist|coverage|\.vscode-test|fixtures|templates|\.git)(\/|$)/;
const HEADER = /SPDX-License-Identifier: Apache-2\.0|Licensed under the Apache License, Version 2\.0/;

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).split('\\').join('/');
    if (SKIP.test(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (EXT.test(name) && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

const missing = walk(ROOT, []).filter((f) => !HEADER.test(readFileSync(f, 'utf8').slice(0, 600)));
if (missing.length) {
  console.error(
    'Missing Apache-2.0 license header:\n' + missing.map((f) => '  ' + relative(ROOT, f)).join('\n'),
  );
  process.exit(1);
}
console.log('license headers OK');
