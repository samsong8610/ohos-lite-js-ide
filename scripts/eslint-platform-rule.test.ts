/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Verifies the NFR-PLT-004 lint rule: business code may not spawn processes or inspect the host OS.
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

const BUSINESS = 'packages/build/src/__probe__.ts';

describe('platform abstraction lint rule (NFR-PLT-004)', () => {
  it.each([
    ["import { spawn } from 'child_process';\nexport const x = spawn;\n", 'no-restricted-imports'],
    ["import { execFile } from 'node:child_process';\nexport const x = execFile;\n", 'no-restricted-imports'],
    ["import { platform } from 'os';\nexport const x = platform;\n", 'no-restricted-syntax'],
    ["import { win32 } from 'node:path';\nexport const x = win32;\n", 'no-restricted-syntax'],
    ["import * as os from 'node:os';\nexport const x = os.platform();\n", 'no-restricted-properties'],
    ["import * as path from 'path';\nexport const x = path.posix;\n", 'no-restricted-properties'],
    ['export const x = process.platform;\n', 'no-restricted-properties'],
  ])('rejects in business code: %s', async (code, rule) => {
    expect(await ruleIds(code, BUSINESS)).toContain(rule);
  });

  it('allows path.join / os.homedir in business code', async () => {
    const code =
      "import * as path from 'path';\nimport { homedir } from 'os';\nexport const x = path.join(homedir(), 'a');\n";
    expect(await ruleIds(code, BUSINESS)).toEqual([]);
  });

  it('allows child_process inside core/src/platform', async () => {
    const code = "import { spawn } from 'child_process';\nexport const x = spawn;\n";
    expect(await ruleIds(code, 'packages/core/src/platform/__probe__.ts')).toEqual([]);
  });
});
