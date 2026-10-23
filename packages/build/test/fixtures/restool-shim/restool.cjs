#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/** CI shim: invokes real restool CLI shape; emits DevEco-built hellolite `resources.index`. */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function opt(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const bundle = opt('-p');
const outDir = opt('-o');
const tablePath = opt('-r');
const jsonPath = opt('-j');

if (!outDir) {
  console.error('restool-shim: -o required');
  process.exit(2);
}

const indexFixture = path.join(__dirname, '../gold-hap/resources.index');
if (!fs.existsSync(indexFixture)) {
  console.error('restool-shim: missing gold resources.index fixture');
  process.exit(2);
}

if (jsonPath && !jsonPath.endsWith('config.json')) {
  console.error('restool-shim: only FA config.json gold path supported in CI');
  process.exit(2);
}

if (bundle && bundle !== 'com.example.hellolite') {
  console.error(`restool-shim: unexpected bundle ${bundle}`);
  process.exit(2);
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(indexFixture, path.join(outDir, 'resources.index'));

if (tablePath) {
  fs.mkdirSync(path.dirname(tablePath), { recursive: true });
  fs.writeFileSync(
    tablePath,
    [
      'string MainAbility_desc 0x01000000',
      'string MainAbility_label 0x01000001',
      'string module_desc 0x01000002',
      'media icon 0x01000003',
      'media icon_small 0x01000004',
    ].join('\n') + '\n',
  );
}

process.exit(0);
