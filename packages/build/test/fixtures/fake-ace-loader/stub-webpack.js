#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Minimal ace-loader stand-in for CI: reads aceModuleRoot / aceModuleBuild env and
 * writes compiled JS files into the build directory (FA assets/js layout input).
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else if (name.endsWith('.js')) fs.copyFileSync(s, d);
  }
}

const root = process.env.aceModuleRoot;
const out = process.env.aceModuleBuild;
if (!root || !out) {
  console.error('fake-ace-loader: aceModuleRoot and aceModuleBuild env required');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
copyDir(root, out);
console.log(`fake-ace-loader: wrote JS tree to ${out}`);
process.exit(0);
