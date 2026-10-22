/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import type { JsApiCapability, JsCapabilitiesFile, JsMacro } from '@ohjs/schemas';
import { conditionsByLine, stripComments } from './cpp';

/**
 * `<version>/js-capabilities.json` from a third_party/jerryscript checkout: which built-in APIs the
 * device engine build has. The device build compiles jerry-core with the `jerry_core_defines` of
 * jerry-core/BUILD.gn (values from engine.gni); everything else falls back to the defaults in config.h,
 * whose first section applies to every non-Windows (gn/IAR) build.
 */

export const JERRY_PATHS = {
  gni: 'engine.gni',
  build: 'jerry-core/BUILD.gn',
  config: 'jerry-core/config.h',
  magic: 'jerry-core/lit/lit-magic-strings.inc.h',
  builtins: 'jerry-core/ecma/builtin-objects',
  api: 'jerry-core/include/jerryscript-core.h',
} as const;

/** APIs probed against the engine's builtin tables: ES2015+ plus ES5 APIs that depend on build macros. */
export const JS_API_PROBES: ReadonlyArray<readonly [name: string, since: string]> = [
  ['Symbol', 'ES2015'],
  ['Promise', 'ES2015'],
  ['Map', 'ES2015'],
  ['Set', 'ES2015'],
  ['WeakMap', 'ES2015'],
  ['WeakSet', 'ES2015'],
  ['Proxy', 'ES2015'],
  ['Reflect', 'ES2015'],
  ['ArrayBuffer', 'ES2015'],
  ['DataView', 'ES2015'],
  ['Uint8Array', 'ES2015'],
  ['Float64Array', 'ES2015'],
  ['RegExp', 'ES3'],
  ['eval', 'ES1'],
  ['BigInt', 'ES2020'],
  ['globalThis', 'ES2020'],
  ['WeakRef', 'ES2021'],
  ['FinalizationRegistry', 'ES2021'],
  ['AggregateError', 'ES2021'],
  ['SharedArrayBuffer', 'ES2017'],
  ['Atomics', 'ES2017'],
  ['Object.assign', 'ES2015'],
  ['Object.is', 'ES2015'],
  ['Object.setPrototypeOf', 'ES2015'],
  ['Object.getOwnPropertySymbols', 'ES2015'],
  ['Object.entries', 'ES2017'],
  ['Object.values', 'ES2017'],
  ['Object.getOwnPropertyDescriptors', 'ES2017'],
  ['Object.fromEntries', 'ES2019'],
  ['Array.from', 'ES2015'],
  ['Array.of', 'ES2015'],
  ['Array.prototype.find', 'ES2015'],
  ['Array.prototype.findIndex', 'ES2015'],
  ['Array.prototype.fill', 'ES2015'],
  ['Array.prototype.copyWithin', 'ES2015'],
  ['Array.prototype.entries', 'ES2015'],
  ['Array.prototype.keys', 'ES2015'],
  ['Array.prototype.values', 'ES2015'],
  ['Array.prototype.includes', 'ES2016'],
  ['Array.prototype.flat', 'ES2019'],
  ['Array.prototype.flatMap', 'ES2019'],
  ['Array.prototype.at', 'ES2022'],
  ['String.fromCodePoint', 'ES2015'],
  ['String.raw', 'ES2015'],
  ['String.prototype.includes', 'ES2015'],
  ['String.prototype.startsWith', 'ES2015'],
  ['String.prototype.endsWith', 'ES2015'],
  ['String.prototype.repeat', 'ES2015'],
  ['String.prototype.codePointAt', 'ES2015'],
  ['String.prototype.normalize', 'ES2015'],
  ['String.prototype.match', 'ES3'],
  ['String.prototype.replace', 'ES3'],
  ['String.prototype.search', 'ES3'],
  ['String.prototype.split', 'ES3'],
  ['String.prototype.padStart', 'ES2017'],
  ['String.prototype.padEnd', 'ES2017'],
  ['String.prototype.trimStart', 'ES2019'],
  ['String.prototype.trimEnd', 'ES2019'],
  ['String.prototype.matchAll', 'ES2020'],
  ['String.prototype.replaceAll', 'ES2021'],
  ['Number.isInteger', 'ES2015'],
  ['Number.isNaN', 'ES2015'],
  ['Number.isFinite', 'ES2015'],
  ['Number.isSafeInteger', 'ES2015'],
  ['Number.EPSILON', 'ES2015'],
  ['Math.trunc', 'ES2015'],
  ['Math.sign', 'ES2015'],
  ['Math.cbrt', 'ES2015'],
  ['Math.log2', 'ES2015'],
  ['Math.log10', 'ES2015'],
  ['Math.hypot', 'ES2015'],
  ['Math.fround', 'ES2015'],
  ['Math.imul', 'ES2015'],
  ['Math.clz32', 'ES2015'],
  ['Promise.all', 'ES2015'],
  ['Promise.race', 'ES2015'],
  ['Promise.allSettled', 'ES2020'],
  ['Promise.any', 'ES2021'],
  ['Promise.prototype.finally', 'ES2018'],
  ['Symbol.iterator', 'ES2015'],
  ['Symbol.asyncIterator', 'ES2018'],
];

/** Owner → builtin table file (relative to ecma/builtin-objects). */
export const OWNER_FILES: Record<string, string> = {
  global: 'ecma-builtin-global.inc.h',
  Object: 'ecma-builtin-object.inc.h',
  Array: 'ecma-builtin-array.inc.h',
  'Array.prototype': 'ecma-builtin-array-prototype.inc.h',
  String: 'ecma-builtin-string.inc.h',
  'String.prototype': 'ecma-builtin-string-prototype.inc.h',
  Number: 'ecma-builtin-number.inc.h',
  Math: 'ecma-builtin-math.inc.h',
  Promise: 'ecma-builtin-promise.inc.h',
  'Promise.prototype': 'ecma-builtin-promise-prototype.inc.h',
  Symbol: 'ecma-builtin-symbol.inc.h',
};

/** Macros that turn a present routine into a stub (ecma-eval.c returns undefined when eval is disabled). */
const DISABLING_MACROS: Record<string, string> = { eval: 'JERRY_BUILTIN_EVAL_DISABLED' };

export interface MacroTable {
  get(name: string): JsMacro | undefined;
  value(name: string): number;
  used: Map<string, JsMacro>;
}

/** `name = value` assignments in engine.gni (inside declare_args). */
export function parseGni(text: string): Map<string, { value: string; line: number }> {
  const out = new Map<string, { value: string; line: number }>();
  text.split('\n').forEach((l, i) => {
    const m = /^\s*(\w+)\s*=\s*([^#\s][^#]*?)\s*(?:#.*)?$/.exec(l);
    if (m) out.set(m[1]!, { value: m[2]!.replace(/^"|"$/g, ''), line: i + 1 });
  });
  return out;
}

/** `"JERRY_X=${arg}"` / `"JERRY_X=(128)"` / `"JERRY_X"` entries of the first `jerry_core_defines` block. */
export function parseBuildDefines(text: string): Map<string, { raw: string; line: number }> {
  const out = new Map<string, { raw: string; line: number }>();
  const lines = text.split('\n');
  let inBlock = false;
  let blocks = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*jerry_core_defines\s*\+?=\s*\[/.test(l)) {
      inBlock = true;
      blocks++;
      continue;
    }
    if (!inBlock) {
      if (blocks && /^\s*\}\s*else\b/.test(l)) break;
      continue;
    }
    if (/^\s*\]/.test(l)) {
      inBlock = false;
      continue;
    }
    const m = /"(\w+)(?:=([^"]*))?"/.exec(l);
    if (m && !out.has(m[1]!)) out.set(m[1]!, { raw: m[2] ?? '1', line: i + 1 });
  }
  return out;
}

/** `#ifndef X` / `# define X V` defaults of config.h: the non-Windows section first, then the general one. */
export function parseConfigDefaults(text: string): {
  gn: Map<string, { raw: string; line: number }>;
  general: Map<string, { raw: string; line: number }>;
} {
  const gn = new Map<string, { raw: string; line: number }>();
  const general = new Map<string, { raw: string; line: number }>();
  const lines = text.split('\n');
  let section: 'gn' | 'win' | 'general' = 'general';
  let depth = 0;
  let sectionDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (/^#\s*if/.test(l)) {
      depth++;
      if (section === 'general' && /^#\s*if\s*\(\s*!defined\s*\(_WIN32\)/.test(l)) {
        section = 'gn';
        sectionDepth = depth;
      } else if (section === 'general' && /^#\s*if\s+defined\s*\(\s*_WIN32\s*\)/.test(l)) {
        section = 'win';
        sectionDepth = depth;
      }
      continue;
    }
    if (/^#\s*endif/.test(l)) {
      if (depth === sectionDepth) {
        section = 'general';
        sectionDepth = -1;
      }
      depth--;
      continue;
    }
    const m = /^#\s*define\s+(JERRY_\w+)(?:\s+(.+?))?\s*$/.exec(l);
    if (!m || section === 'win') continue;
    const target = section === 'gn' ? gn : general;
    if (!target.has(m[1]!))
      target.set(m[1]!, { raw: (m[2] ?? '1').replace(/\/\/.*$|\/\*.*$/, '').trim(), line: i + 1 });
  }
  return { gn, general };
}

/** Resolves build macros for the device build: BUILD.gn define, then config.h (non-Windows), then config.h general. */
export function macroTable(gniText: string, buildText: string, configText: string): MacroTable {
  const gni = parseGni(gniText);
  const defs = parseBuildDefines(buildText);
  const cfg = parseConfigDefaults(configText);
  const cache = new Map<string, JsMacro | undefined>();
  const used = new Map<string, JsMacro>();
  const evalRaw = (raw: string, seen: Set<string>): { value: number; via?: string } => {
    const arg = /^\$\{(\w+)\}$/.exec(raw);
    if (arg) {
      const g = gni.get(arg[1]!);
      const v = g ? Number(g.value === 'true' ? 1 : g.value === 'false' ? 0 : g.value) : 0;
      return {
        value: Number.isFinite(v) ? v : 0,
        via: g ? `engine.gni:${g.line} ${arg[1]}` : `${arg[1]} (unset)`,
      };
    }
    const num = /^\(?\s*(-?\d+)\s*\)?$/.exec(raw);
    if (num) return { value: Number(num[1]) };
    if (/^JERRY_\w+$/.test(raw)) {
      const m = resolve(raw, seen);
      return { value: m?.value ?? 0, via: raw };
    }
    return { value: 1 };
  };
  const resolve = (name: string, seen = new Set<string>()): JsMacro | undefined => {
    if (cache.has(name)) return cache.get(name);
    if (seen.has(name)) return undefined;
    seen.add(name);
    let r: JsMacro | undefined;
    const d = defs.get(name);
    const g = cfg.gn.get(name);
    const c = cfg.general.get(name);
    if (d) {
      const v = evalRaw(d.raw, seen);
      r = { value: v.value, source: `${JERRY_PATHS.build}:${d.line}${v.via ? ` ← ${v.via}` : ''}` };
    } else if (g ?? c) {
      const e = (g ?? c)!;
      const v = evalRaw(e.raw, seen);
      r = { value: v.value, source: `${JERRY_PATHS.config}:${e.line}${v.via ? ` ← ${v.via}` : ''}` };
    }
    cache.set(name, r);
    return r;
  };
  return {
    get: (n) => resolve(n),
    value: (n) => {
      const m = resolve(n);
      if (m) used.set(n, m);
      return m?.value ?? 0;
    },
    used,
  };
}

/** Evaluates one preprocessor condition with the macro table; undefined for expressions it cannot read. */
export function evalCondition(cond: string, macros: MacroTable): boolean | undefined {
  let e = cond
    .replace(/\bENABLED\s*\(\s*(\w+)\s*\)/g, (_m, n: string) => String(macros.value(n)))
    .replace(/\bdefined\s*\(\s*(\w+)\s*\)/g, (_m, n: string) => (macros.get(n) ? '1' : '0'))
    .replace(/\b(JERRY_\w+)\b/g, (_m, n: string) => String(macros.value(n)));
  e = e.replace(/\s+/g, ' ');
  if (!/^[\d\s!&|()=<>]*$/.test(e)) return undefined;
  try {
    return !!(new Function(`return (${e});`)() as unknown);
  } catch {
    return undefined;
  }
}

/** `LIT_MAGIC_STRING_DEF (ID, "str")` → id per string. */
export function parseMagicStrings(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of text.matchAll(/LIT_MAGIC_STRING_DEF\s*\(\s*(\w+)\s*,\s*"([^"]*)"\s*\)/g)) {
    const l = out.get(m[2]!) ?? [];
    l.push(m[1]!);
    out.set(m[2]!, l);
  }
  return out;
}

export interface TableEntry {
  id: string;
  line: number;
  conds: string[];
}

/** Property entries (ROUTINE, OBJECT_VALUE, NUMBER_VALUE, SYMBOL_VALUE, ACCESSOR_*…) of a builtin `.inc.h`. */
export function parseBuiltinTable(text: string): TableEntry[] {
  const src = stripComments(text);
  const conds = conditionsByLine(src);
  const out: TableEntry[] = [];
  src.split('\n').forEach((l, i) => {
    const m = /^\s*[A-Z_]+\s*\(\s*(LIT_(?:MAGIC_STRING|GLOBAL_SYMBOL)_\w+)/.exec(l);
    if (m)
      out.push({
        id: m[1]!,
        line: i + 1,
        conds: (conds[i + 1] ?? []).filter((c) => !/^!defined\(\w+\)$/.test(c)),
      });
  });
  return out;
}

/** symbol ids are spelled LIT_GLOBAL_SYMBOL_ITERATOR / LIT_MAGIC_STRING_..._UL */
function idsFor(prop: string, magic: Map<string, string[]>, owner: string): string[] {
  const ids = [...(magic.get(prop) ?? [])];
  if (owner === 'Symbol')
    ids.push(`LIT_GLOBAL_SYMBOL_${prop.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  return ids;
}

export function probeApis(
  macros: MacroTable,
  read: (rel: string) => string,
  probes: ReadonlyArray<readonly [string, string]> = JS_API_PROBES,
): JsApiCapability[] {
  const magic = parseMagicStrings(read(JERRY_PATHS.magic));
  const tables = new Map<string, TableEntry[]>();
  const table = (owner: string): TableEntry[] | undefined => {
    const f = OWNER_FILES[owner];
    if (!f) return undefined;
    if (!tables.has(owner)) tables.set(owner, parseBuiltinTable(read(`${JERRY_PATHS.builtins}/${f}`)));
    return tables.get(owner);
  };
  const lookup = (
    owner: string,
    prop: string,
  ): { available: boolean; source: string; guard?: string; reason?: string } => {
    const file = `${JERRY_PATHS.builtins}/${OWNER_FILES[owner]}`;
    const entries = table(owner) ?? [];
    const ids = new Set(idsFor(prop, magic, owner));
    const hit = entries.find((e) => ids.has(e.id));
    if (!hit)
      return {
        available: false,
        source: `${file}: no entry`,
        reason: 'not implemented by the device JerryScript engine',
      };
    const failing = hit.conds.filter((c) => evalCondition(c, macros) === false);
    const guard = hit.conds.length ? hit.conds.join(' && ') : undefined;
    if (failing.length) {
      const names = [...failing.join(' ').matchAll(/\b(JERRY_\w+)\b/g)].map((m) => m[1]!);
      const why = names
        .map((n) => `${n} = ${macros.value(n)} (${macros.get(n)?.source ?? 'undefined'})`)
        .join(', ');
      return {
        available: false,
        source: `${file}:${hit.line}`,
        ...(guard ? { guard } : {}),
        reason: `compiled out of the device engine: ${why}`,
      };
    }
    return { available: true, source: `${file}:${hit.line}`, ...(guard ? { guard } : {}) };
  };
  const out: JsApiCapability[] = [];
  for (const [name, since] of probes) {
    const parts = name.split('.');
    let r: ReturnType<typeof lookup>;
    if (parts.length === 1) r = lookup('global', name);
    else {
      const owner = parts.length === 3 ? `${parts[0]}.prototype` : parts[0]!;
      r = lookup(owner, parts[parts.length - 1]!);
      if (r.available && parts[0] !== 'Object' && parts[0] !== 'Array' && parts[0] !== 'String') {
        // the owner object itself must be built in (e.g. Promise.prototype.then needs Promise)
        const o = lookup('global', parts[0]!);
        if (!o.available) r = { ...o, source: `${r.source}; owner ${o.source}` };
      }
    }
    const dis = DISABLING_MACROS[name];
    if (r.available && dis && macros.value(dis)) {
      r = {
        ...r,
        available: false,
        reason: `disabled in the device engine: ${dis} = ${macros.value(dis)} (${macros.get(dis)!.source}); the call returns undefined`,
      };
    }
    out.push({ name, since, ...r });
  }
  return out;
}

export function generateJsCapabilities(
  jerryRoot: string,
  meta: { ohVersion: string; generator: string; commit?: string; tags: string[] },
): JsCapabilitiesFile {
  const read = (rel: string): string => fs.readFileSync(path.join(jerryRoot, rel), 'utf8');
  const macros = macroTable(read(JERRY_PATHS.gni), read(JERRY_PATHS.build), read(JERRY_PATHS.config));
  const apis = probeApis(macros, read);
  for (const n of ['JERRY_ES2015', 'JERRY_BUILTIN_REGEXP', 'JERRY_BUILTIN_EVAL_DISABLED']) macros.value(n);
  const api = read(JERRY_PATHS.api);
  const major = /JERRY_API_MAJOR_VERSION\s+(\d+)/.exec(api)?.[1] ?? '?';
  const minor = /JERRY_API_MINOR_VERSION\s+(\d+)/.exec(api)?.[1] ?? '?';
  const macroOut = Object.fromEntries([...macros.used].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    schemaFormat: 1,
    ohVersion: meta.ohVersion,
    generator: meta.generator,
    engine: {
      name: 'jerryscript',
      apiVersion: `${major}.${minor}`,
      ...(meta.commit ? { commit: meta.commit } : {}),
      tags: meta.tags,
    },
    macros: macroOut,
    apis,
  };
}

/** Markdown diff of two capability files (availability changes and macro value changes). */
export function renderJsCapabilitiesDiff(a: JsCapabilitiesFile, b: JsCapabilitiesFile): string {
  const lines = [`# JS capabilities: ${a.ohVersion} → ${b.ohVersion}`, ''];
  lines.push(`JerryScript API ${a.engine.apiVersion} → ${b.engine.apiVersion}`, '');
  const am = new Map(a.apis.map((x) => [x.name, x]));
  const bm = new Map(b.apis.map((x) => [x.name, x]));
  const changes: string[] = [];
  for (const [n, x] of bm) {
    const y = am.get(n);
    if (!y) changes.push(`- ${n}: added to the probe list (${x.available ? 'available' : 'unavailable'})`);
    else if (y.available !== x.available)
      changes.push(
        `- ${n}: ${y.available ? 'available' : 'unavailable'} → ${x.available ? 'available' : 'unavailable'}`,
      );
  }
  for (const n of am.keys()) if (!bm.has(n)) changes.push(`- ${n}: removed from the probe list`);
  const macroChanges: string[] = [];
  for (const k of new Set([...Object.keys(a.macros), ...Object.keys(b.macros)])) {
    const x = a.macros[k]?.value;
    const y = b.macros[k]?.value;
    if (x !== y) macroChanges.push(`- ${k}: ${x ?? '—'} → ${y ?? '—'}`);
  }
  lines.push('## Built-in APIs', '', ...(changes.length ? changes : ['No availability changes.']), '');
  lines.push(
    '## Build macros',
    '',
    ...(macroChanges.length ? macroChanges : ['No macro value changes.']),
    '',
  );
  return lines.join('\n');
}
