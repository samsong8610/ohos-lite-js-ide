/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { conditionsByLine, stripComments } from './cpp';

export interface MacroDefinition {
  name: string;
  value: string;
  line: number;
  /** external build conditions the define depends on, e.g. defined(ACE_ENGINE_LITE_CAMERA_LITE_ENABLE) */
  dependsOn: string[];
}

/**
 * FeatureMacroParser for targets/<target>/acelite_config.h.
 * The uniqueness guard idiom `#ifdef X / #error / #else / #define X 1` and the default idiom
 * `#ifndef X / #define X 1` are unconditional; any other surrounding condition is reported in dependsOn.
 */
export function parseAceliteConfig(text: string): MacroDefinition[] {
  const src = stripComments(text);
  const conds = conditionsByLine(src);
  const out: MacroDefinition[] = [];
  src.split('\n').forEach((l, i) => {
    const m = /^\s*#\s*define\s+([A-Z][A-Z0-9_]*)(?:\s+(.+?))?\s*$/.exec(l);
    if (!m) return;
    const name = m[1]!;
    if (/_H$/.test(name)) return;
    const own = new RegExp(`^!?\\(?!?defined\\(${name}\\)\\)?$`);
    const dependsOn = (conds[i + 1] ?? []).filter((c) => !own.test(c));
    out.push({ name, value: (m[2] ?? '').trim(), line: i + 1, dependsOn });
  });
  return out;
}

export type FeatureValue = boolean | 'conditional';

/** FEATURE_* switches as booleans; defines that depend on external build flags become 'conditional'. */
export function featureSwitches(
  defs: MacroDefinition[],
): Record<string, { value: FeatureValue; line: number; dependsOn?: string[] }> {
  const out: Record<string, { value: FeatureValue; line: number; dependsOn?: string[] }> = {};
  for (const d of defs) {
    if (!d.name.startsWith('FEATURE_') && !d.name.startsWith('ENABLE_')) continue;
    const on = d.value === '' || d.value === '1';
    if (d.dependsOn.length) out[d.name] = { value: 'conditional', line: d.line, dependsOn: d.dependsOn };
    else out[d.name] = { value: on, line: d.line };
  }
  return out;
}

/** Non-feature string settings such as RUNTIME_MODE_FILE_PATH. */
export function stringSettings(defs: MacroDefinition[]): Record<string, { value: string; line: number }> {
  const out: Record<string, { value: string; line: number }> = {};
  for (const d of defs) {
    const m = /^"(.*)"$/.exec(d.value);
    if (m) out[d.name] = { value: m[1]!, line: d.line };
  }
  return out;
}
