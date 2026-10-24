/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isOhjsError } from '@ohjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { JERRY_BC_MAGIC } from './hap-content';
import { jerryBytecodeMissingError, validateJerryBytecodeTree } from './hap-packer';

describe('validateJerryBytecodeTree', () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('reports Jerry lite snapshot hint when .bc sibling is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-jerry-bc-'));
    tmpDir = dir;
    const jsPath = path.join(dir, 'app.js');
    fs.writeFileSync(jsPath, 'export default {}');
    try {
      validateJerryBytecodeTree(dir);
      expect.unreachable('expected BLD-FAILED');
    } catch (e) {
      expect(isOhjsError(e, 'BLD-FAILED')).toBe(true);
      if (!isOhjsError(e)) return;
      expect(e.message).toContain('missing Jerry lite snapshot bytecode');
      expect(e.message).toContain('app.js');
      expect(e.detail.hint).toContain('Expected sibling:');
      expect(e.detail.hint).toContain('app.bc');
      expect(e.detail.hint).toMatch(/SnapshotPlugin/i);
      expect(e.detail.hint).toMatch(/buildMode=release/);
      expect(e.detail.hint).toMatch(/jerry-snapshot/);
    }
  });

  it('accepts real JRRY1 bytecode beside .js', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-jerry-bc-'));
    tmpDir = dir;
    fs.writeFileSync(path.join(dir, 'app.js'), '');
    fs.writeFileSync(path.join(dir, 'app.bc'), Buffer.concat([JERRY_BC_MAGIC, Buffer.alloc(32)]));
    expect(() => validateJerryBytecodeTree(dir)).not.toThrow();
  });

  it('jerryBytecodeMissingError names the expected .bc path', () => {
    const err = jerryBytecodeMissingError('C:\\out\\app.js', 'C:\\out\\app.bc');
    expect(err.detail.hint).toContain('C:\\out\\app.bc');
  });
});
