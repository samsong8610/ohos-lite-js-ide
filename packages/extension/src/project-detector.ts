/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Precise activation check (ARCHITECTURE §4, FR-PRJ-003): a workspace is an OpenHarmony
 * Lite JS project only when its FA `config.json` declares a JS ability or a `module.js[]` section.
 * Pure function so it can be unit tested without VS Code.
 */
export interface ProjectDetection {
  isProject: boolean;
  reason: string;
}

export function detectFromConfigJson(text: string): ProjectDetection {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonComments(text));
  } catch (e) {
    return { isProject: false, reason: `config.json is not valid JSON: ${(e as Error).message}` };
  }
  if (!isObject(json)) return { isProject: false, reason: 'config.json root is not an object' };
  const module = json['module'];
  if (!isObject(module)) return { isProject: false, reason: 'config.json has no "module" object' };
  const abilities = module['abilities'];
  if (Array.isArray(abilities) && abilities.some((a) => isObject(a) && a['srcLanguage'] === 'js')) {
    return { isProject: true, reason: 'module.abilities[].srcLanguage is "js"' };
  }
  const js = module['js'];
  if (Array.isArray(js) && js.length > 0) {
    return { isProject: true, reason: 'module.js[] is present' };
  }
  return { isProject: false, reason: 'no JS ability and no module.js[] in config.json' };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Removes // and /* *\/ comments outside of strings (config.json is often hand-edited). */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i++;
      } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return out;
}
