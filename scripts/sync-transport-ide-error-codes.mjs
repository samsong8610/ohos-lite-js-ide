#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/** Copy docs/ide-error-codes.json into @ohjs/transport-hdc for runtime + esbuild bundling. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'docs/ide-error-codes.json');
const dst = join(root, 'packages/transport-hdc/src/vendor/ide-error-codes.json');
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`synced ide-error-codes.json → ${dst}`);
