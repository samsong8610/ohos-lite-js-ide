/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { finished } from 'node:stream/promises';
import { OhjsError } from '@ohjs/core';
import yazl from 'yazl';

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

/** Zip entry paths always use `/` (PKZIP convention), including on Windows hosts. */
function zipEntryName(stagingDir: string, filePath: string): string {
  return path.relative(stagingDir, filePath).split(path.sep).join('/');
}

/** Creates a `.hap` (zip) from a staging directory using yazl (no host `zip` binary). */
export async function packStagingToHap(stagingDir: string, hapPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(hapPath), { recursive: true });
  const files = await listFiles(stagingDir);
  if (files.length === 0) throw new OhjsError('BLD-FAILED', 'Build staging directory is empty');

  const zipfile = new yazl.ZipFile();
  for (const full of files) {
    zipfile.addFile(full, zipEntryName(stagingDir, full));
  }
  zipfile.end();

  const out = fs.createWriteStream(hapPath);
  zipfile.outputStream.pipe(out);
  try {
    await finished(out);
  } catch (e) {
    throw new OhjsError('BLD-FAILED', `failed to write HAP: ${(e as Error).message}`, { hint: hapPath });
  }
}
