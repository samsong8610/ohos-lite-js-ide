/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ModuleAvailability, SystemModuleSchema, SystemModulesFile } from '@ohjs/schemas';
import { conditionsByLine, stripComments } from './cpp';
import type { FeatureValue } from './feature-macros';

export const MODULE_CONFIG = 'frameworks/module_manager/ohos_module_config.h';
/** modules compiled only for the engine's own require() unit tests */
export const TEST_ONLY_GUARDS = new Set(['ENABLE_MODULE_REQUIRE_TEST']);

export interface ModuleRegistration {
  name: string;
  init: string;
  /** FEATURE_* / ENABLE_* macro the entry is guarded by */
  guard?: string;
  line: number;
}

/** Entries of `const Module OHOS_MODULES[] = { {"router", InitRouterModule}, ... }` with their #if guards. */
export function parseModuleConfig(text: string): ModuleRegistration[] {
  const src = stripComments(text);
  const start = src.search(/\bOHOS_MODULES\s*\[\s*\]\s*=\s*\{/);
  if (start < 0) return [];
  const conds = conditionsByLine(src);
  const lines = src.split('\n');
  const firstLine = src.slice(0, start).split('\n').length;
  const out: ModuleRegistration[] = [];
  for (let i = firstLine - 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*\}\s*;/.test(l)) break;
    const m = /\{\s*"([^"]+)"\s*,\s*(\w+)\s*\}/.exec(l);
    if (!m) continue;
    let guard: string | undefined;
    for (const c of conds[i + 1] ?? []) {
      const g = /^\(?\s*(?:defined\()?((?:FEATURE|ENABLE)_[A-Z0-9_]+)\)?\s*(?:==\s*1)?\s*\)?$/.exec(c);
      if (g) guard = g[1];
    }
    out.push({ name: m[1]!, init: m[2]!, ...(guard ? { guard } : {}), line: i + 1 });
  }
  return out;
}

/** Combines registrations with the target's feature switches (undefined macro = off). */
export function buildSystemModules(
  regs: readonly ModuleRegistration[],
  features: Readonly<Record<string, { value: FeatureValue }>>,
  meta: { ohVersion: string; target: string; generator: string },
): SystemModulesFile {
  const modules: SystemModuleSchema[] = [];
  for (const r of regs) {
    if (r.guard && TEST_ONLY_GUARDS.has(r.guard)) continue;
    const v = r.guard ? features[r.guard]?.value : true;
    const availability: ModuleAvailability =
      v === true ? 'available' : v === 'conditional' ? 'conditional' : 'disabled-by-feature';
    modules.push({
      name: r.name,
      availability,
      ...(r.guard ? { feature: r.guard } : {}),
      evidence: [{ repo: 'engine', file: MODULE_CONFIG, line: r.line }],
    });
  }
  modules.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { schemaFormat: 1, ...meta, categories: ['system', 'ohos'], modules };
}
