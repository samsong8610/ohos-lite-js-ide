/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SystemModulesFile } from '@ohjs/schemas';
import type { ModuleRef } from './es5';

export interface ModuleFinding {
  rule: 'js/unknown-system-module';
  message: string;
  range: { start: number; end: number };
}

/**
 * `@system.<name>` / `@ohos.<name>` (and `requireNative('system.<name>')`) must name a module registered in
 * OHOS_MODULES and compiled into the target (ModuleManager::RequireModule returns undefined otherwise).
 */
export function checkSystemModules(refs: readonly ModuleRef[], pack: SystemModulesFile): ModuleFinding[] {
  const out: ModuleFinding[] = [];
  const categories = pack.categories.join('|');
  const re = new RegExp(`^@?(${categories})\\.(.+)$`);
  const available = pack.modules.filter((m) => m.availability !== 'disabled-by-feature').map((m) => m.name);
  for (const r of refs) {
    const m = re.exec(r.specifier);
    if (!m) continue;
    const name = m[2]!;
    const mod = pack.modules.find((x) => x.name === name);
    const range = { start: r.start, end: r.end };
    if (!mod) {
      out.push({
        rule: 'js/unknown-system-module',
        range,
        message: `Module "${r.specifier}" does not exist in OpenHarmony ${pack.ohVersion} (available on ${pack.target}: ${available.join(', ')})`,
      });
    } else if (mod.availability === 'disabled-by-feature') {
      out.push({
        rule: 'js/unknown-system-module',
        range,
        message: `Module "${r.specifier}" is not built into the ${pack.target} target firmware${mod.feature ? ` (${mod.feature} is off)` : ''}; require() returns undefined`,
      });
    }
  }
  return out;
}
