/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type IProcessRunner } from '@ohjs/core';
import { assertRestoolIndex } from './hap-content';

function findResourcesIndex(outDir: string): string | undefined {
  const direct = path.join(outDir, 'resources.index');
  if (fs.existsSync(direct)) return direct;
  const nested = path.join(outDir, 'default', 'resources.index');
  if (fs.existsSync(nested)) return nested;
  const walk = (dir: string, depth: number): string | undefined => {
    if (depth > 4) return undefined;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile() && name === 'resources.index') return full;
      if (fs.statSync(full).isDirectory()) {
        const hit = walk(full, depth + 1);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(outDir, 0);
}

export interface RestoolPathOptions {
  /** VS Code `ohjs.tools.restoolPath` (wins over env when set and path exists). */
  restoolPath?: string;
}

export function resolveRestoolPath(opts?: RestoolPathOptions): string | undefined {
  const setting = opts?.restoolPath?.trim();
  if (setting && fs.existsSync(setting)) return setting;
  const env = process.env.OHJS_RESTOOL?.trim();
  if (env && fs.existsSync(env)) return env;
  return undefined;
}

export const RESTOOL_MISSING_HINT =
  'Set VS Code ohjs.tools.restoolPath or env OHJS_RESTOOL to your OpenHarmony SDK toolchains/restool ' +
  '(e.g. C:\\OpenHarmony\\Sdk\\11\\toolchains\\restool.exe or …/ohos-sdk-…/toolchains/restool). ' +
  'restool cannot be downloaded automatically — see README G2.';

export interface RestoolCompileInput {
  moduleRoot: string;
  configPath: string;
  bundleName: string;
  /** Directory that will contain `resources.index` (e.g. HAP `assets/entry/`). */
  entryAssetsDir: string;
  runner: IProcessRunner;
  restoolPath?: string;
}

/**
 * Run SDK `restool` to emit a real `resources.index` (Restool 2.x header).
 * Requires {@link OHJS_RESTOOL} pointing at the host toolchains binary.
 */
export async function runRestoolCompile(input: RestoolCompileInput): Promise<void> {
  const restool = resolveRestoolPath({ restoolPath: input.restoolPath });
  if (!restool) {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      'Gold HAP pack requires OpenHarmony SDK restool (resources.index)',
      { hint: RESTOOL_MISSING_HINT },
    );
  }

  const mainSrc = path.join(input.moduleRoot, 'src', 'main');
  const workDir = path.join(input.entryAssetsDir, '.restool-work');
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const tablePath = path.join(workDir, 'ResourceTable.txt');

  const args = [
    '-i',
    mainSrc,
    '-j',
    input.configPath,
    '-p',
    input.bundleName,
    '-o',
    workDir,
    '-r',
    tablePath,
    '-f',
  ];
  const cmd = restool.endsWith('.cjs')
    ? { file: process.execPath, args: [restool, ...args] }
    : { file: restool, args };

  const result = await input.runner.run(cmd, { timeoutMs: 120000 });
  if (result.exitCode !== 0) {
    throw new OhjsError('BLD-FAILED', `restool failed: ${result.stderr || result.stdout}`, {
      hint: restool,
      exitCode: result.exitCode,
    });
  }

  const produced = findResourcesIndex(workDir);
  if (!produced) {
    throw new OhjsError('BLD-FAILED', 'restool did not produce resources.index', { hint: workDir });
  }
  const buf = fs.readFileSync(produced);
  assertRestoolIndex(buf, produced);
  const dest = path.join(input.entryAssetsDir, 'resources.index');
  fs.copyFileSync(produced, dest);
  fs.rmSync(workDir, { recursive: true, force: true });
}
