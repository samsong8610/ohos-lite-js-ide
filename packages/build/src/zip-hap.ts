/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type CommandSpec, type IProcessRunner } from '@ohjs/core';

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(full);
  }
  return out;
}

/** Creates a `.hap` zip from a staging directory (uses host `zip` when available). */
export async function packStagingToHap(
  runner: IProcessRunner,
  stagingDir: string,
  hapPath: string,
  zipCommand: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(hapPath), { recursive: true });
  const files = await listFiles(stagingDir);
  if (files.length === 0) throw new OhjsError('BLD-FAILED', 'Build staging directory is empty');

  const rel = files.map((f) => path.relative(stagingDir, f));
  const cmd: CommandSpec = {
    file: zipCommand,
    args: ['-r', '-q', path.resolve(hapPath), ...rel],
    cwd: stagingDir,
  };
  const r = await runner.run(cmd);
  if (r.exitCode !== 0) {
    throw new OhjsError('BLD-FAILED', `zip failed: ${r.stderr || r.stdout}`, { exitCode: r.exitCode });
  }
}
