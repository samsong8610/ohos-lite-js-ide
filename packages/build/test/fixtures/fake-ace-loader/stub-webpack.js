#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Minimal ace-loader stand-in for CI: reads aceModuleRoot / aceModuleBuild env and
 * writes compiled JS under `<aceModuleBuild>/<ability>/` (DevEco loader_out_lite layout).
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else if (name.endsWith('.js') || name.endsWith('.json')) fs.copyFileSync(s, d);
  }
}

function walk(dir, fn) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, fn);
    else fn(full);
  }
}

const root = process.env.aceModuleRoot;
const out = process.env.aceModuleBuild;
const manifestPath = process.env.aceManifestPath;
if (!root || !out) {
  console.error('fake-ace-loader: aceModuleRoot and aceModuleBuild env required');
  process.exit(2);
}

const abilityName = process.env.aceAbilitySrcPath || path.basename(root.replace(/[/\\]+$/, '')) || 'default';
const abilityOut = path.join(out, abilityName);
fs.mkdirSync(abilityOut, { recursive: true });
copyDir(root, abilityOut);

if (manifestPath && fs.existsSync(manifestPath)) {
  fs.copyFileSync(manifestPath, path.join(abilityOut, 'manifest.json'));
}

const stubAppBc = path.join(__dirname, '../gold-hap/stub-app.bc');
const stubIndexBc = path.join(__dirname, '../gold-hap/stub-index.bc');
walk(abilityOut, (file) => {
  if (!file.endsWith('.js')) return;
  const bc = file.replace(/\.js$/, '.bc');
  if (fs.existsSync(bc)) return;
  if (file.endsWith(`${path.sep}app.js`) && fs.existsSync(stubAppBc)) {
    fs.copyFileSync(stubAppBc, bc);
  } else if (file.endsWith(`${path.sep}index.js`) && fs.existsSync(stubIndexBc)) {
    fs.copyFileSync(stubIndexBc, bc);
  }
});

const preview = path.join(abilityOut, 'preview_css.json');
if (!fs.existsSync(preview)) {
  const cssEntries = {};
  walk(root, (file) => {
    if (!file.endsWith('.css')) return;
    cssEntries[file.replace(/\\/g, '/')] = true;
  });
  fs.writeFileSync(preview, JSON.stringify({ entry: cssEntries }));
}

const imageConvert = path.join(abilityOut, 'image_convert_result.txt');
if (!fs.existsSync(imageConvert)) {
  fs.writeFileSync(imageConvert, '{exitCode:0}');
}

console.log(`fake-ace-loader: wrote JS tree to ${abilityOut}`);
process.exit(0);
