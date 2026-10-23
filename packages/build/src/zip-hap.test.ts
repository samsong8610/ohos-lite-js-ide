/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { packStagingToHap } from './zip-hap';

describe('packStagingToHap', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('writes a PK zip with forward-slash entry names', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-zip-'));
    dirs.push(root);
    const staging = path.join(root, 'staging');
    fs.mkdirSync(path.join(staging, 'src', 'main'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'src', 'main', 'config.json'), '{}');

    const hap = path.join(root, 'entry.hap');
    await packStagingToHap(staging, hap);
    const buf = fs.readFileSync(hap);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.includes(Buffer.from('src/main/config.json'))).toBe(true);
  });
});
