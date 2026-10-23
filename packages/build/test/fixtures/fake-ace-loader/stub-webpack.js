#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * CI fake ace-loader: replays DevEco `loader_out_lite` output (real Jerry `.bc` + compiled JS).
 * Production builds must use upstream webpack + lite-snapshot-plugin (OHJS_ACE_LOADER_*).
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const root = process.env.aceModuleRoot;
const out = process.env.aceModuleBuild;
if (!root || !out) {
  console.error('fake-ace-loader: aceModuleRoot and aceModuleBuild env required');
  process.exit(2);
}

const abilityName = process.env.aceAbilitySrcPath || 'MainAbility';
const abilityOut = path.join(out, abilityName);
const fixtureRoot =
  process.env.aceDevecoLoaderFixture ||
  path.join(__dirname, '../hellolite-deveco-loader-out');

if (!fs.existsSync(fixtureRoot)) {
  console.error(`fake-ace-loader: missing DevEco loader fixture at ${fixtureRoot}`);
  process.exit(2);
}

fs.rmSync(abilityOut, { recursive: true, force: true });
copyDir(fixtureRoot, abilityOut);

const jerryMagic = Buffer.from('4a52525931000000', 'hex');
for (const file of walkFiles(abilityOut)) {
  if (!file.endsWith('.bc')) continue;
  const head = fs.readFileSync(file).subarray(0, 8);
  if (!head.equals(jerryMagic)) {
    console.error(`fake-ace-loader: ${file} is not Jerry bytecode (JRRY1)`);
    process.exit(3);
  }
}

console.log(`fake-ace-loader: replayed DevEco loader output to ${abilityOut}`);
process.exit(0);

function walkFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}
