/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Writes `.ohjs/jsconfig.base.json` and `.ohjs/types/*.d.ts` for the selected SDK so VS Code's built-in
// JS service understands a Lite project (ARCHITECTURE §7.1, FR-LANG-007), and wires the user's root
// jsconfig.json to it without overwriting it: created when absent, merged only after the user agrees.
import type { SystemModulesFile } from '@ohjs/schemas';
import {
  ENV_DTS,
  JSCONFIG_BASE,
  MODULES_DTS,
  OHJS_DIR,
  TYPES_DIR,
  generateEnvDts,
  generateSystemModulesDts,
  jsconfigBase,
  planJsconfig,
} from '@ohjs/language-server/out/types-gen/index';

/** Minimal IO surface (paths are '/'-joined relative to the workspace root), so this stays unit-testable. */
export interface TypesIo {
  read(rel: string): Promise<string | undefined>;
  write(rel: string, content: string): Promise<void>;
  /** asks whether to merge the root jsconfig.json; resolves 'merge' | 'later' | 'never' */
  askMerge(changes: string[]): Promise<'merge' | 'later' | 'never'>;
  neverMerge: boolean;
  setNeverMerge(): Promise<void>;
  log(message: string): void;
}

export type JsconfigOutcome = 'created' | 'unchanged' | 'merged' | 'declined' | 'suppressed' | 'unparsable';

/** Writes a file only when its content differs (keeps the TS server from reloading for nothing). */
async function put(io: TypesIo, rel: string, content: string): Promise<boolean> {
  if ((await io.read(rel)) === content) return false;
  await io.write(rel, content);
  return true;
}

export async function writeWorkspaceTypes(
  io: TypesIo,
  pack: SystemModulesFile | undefined,
): Promise<JsconfigOutcome> {
  await put(io, `${OHJS_DIR}/${JSCONFIG_BASE}`, jsconfigBase());
  await put(io, `${OHJS_DIR}/${TYPES_DIR}/${ENV_DTS}`, generateEnvDts());
  if (pack) await put(io, `${OHJS_DIR}/${TYPES_DIR}/${MODULES_DTS}`, generateSystemModulesDts(pack));
  else io.log('jsconfig: no system-modules data for this SDK; @system.* declarations not generated');

  const plan = planJsconfig(await io.read('jsconfig.json'));
  switch (plan.action) {
    case 'create':
      await io.write('jsconfig.json', plan.content);
      io.log('jsconfig: created jsconfig.json extending .ohjs/jsconfig.base.json');
      return 'created';
    case 'none':
      return 'unchanged';
    case 'unparsable':
      io.log(`jsconfig: jsconfig.json left untouched (cannot parse: ${plan.error})`);
      return 'unparsable';
    case 'merge': {
      if (io.neverMerge) return 'suppressed';
      const answer = await io.askMerge(plan.changes);
      if (answer === 'merge') {
        await io.write('jsconfig.json', plan.content);
        io.log(`jsconfig: merged (${plan.changes.join(', ')})`);
        return 'merged';
      }
      if (answer === 'never') await io.setNeverMerge();
      return 'declined';
    }
  }
}
