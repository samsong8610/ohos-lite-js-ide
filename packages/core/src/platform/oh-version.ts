/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** OpenHarmony releases for which the IDE may ship or locate a matching host `hdc`. */
export const HDC_TOOLCHAIN_OH_VERSIONS = ['5.0.3', '6.1-LTS'] as const;
export type HdcToolchainOhVersion = (typeof HDC_TOOLCHAIN_OH_VERSIONS)[number];

/** Same naming as `@ohjs/schemas` `versionDirName` (v5.0.3, v6.1-lts). */
export function ohVersionDirName(ohVersion: string): string {
  return `v${ohVersion.replace(/^v/i, '').toLowerCase()}`;
}

/** Normalizes user / device strings to a canonical toolchain id when possible. */
export function normalizeHdcToolchainOhVersion(raw: string | undefined): HdcToolchainOhVersion | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  const lower = s.toLowerCase();
  for (const v of HDC_TOOLCHAIN_OH_VERSIONS) {
    if (lower === v.toLowerCase()) return v;
  }
  const stripped = s.replace(/^openharmony[-\s]*/i, '');
  const m = /^(\d+)\.(\d+)/.exec(stripped);
  if (!m) return undefined;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 6 || (major === 6 && minor >= 1)) return '6.1-LTS';
  if (major === 5 && minor === 0) return '5.0.3';
  if (major === 6 && minor === 0) return '5.0.3';
  return undefined;
}

/**
 * Parses OpenHarmony version text from `param get`, a runtime manifest, or hdc target names.
 * Returns a normalized toolchain id when the string is recognized.
 */
export function parseDeviceOhVersionText(text: string): HdcToolchainOhVersion | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    if (trimmed.startsWith('{')) {
      const j = JSON.parse(trimmed) as {
        ohVersion?: unknown;
        openHarmonyVersion?: unknown;
        sdkVersion?: unknown;
      };
      for (const k of [j.ohVersion, j.openHarmonyVersion, j.sdkVersion]) {
        if (typeof k === 'string') {
          const n = normalizeHdcToolchainOhVersion(k);
          if (n) return n;
        }
      }
    }
  } catch {
    // not JSON
  }
  const line =
    trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('[')) ?? trimmed;
  const ver = line.match(/OpenHarmony[-\s]?(\d+\.\d+(?:\.\d+)?(?:-LTS)?)/i)?.[1] ?? line.match(/(\d+\.\d+(?:\.\d+)?(?:-LTS)?)/i)?.[1];
  return ver ? normalizeHdcToolchainOhVersion(ver) : undefined;
}

export interface ProjectToolchainFile {
  hdc?: string;
  ohVersion?: string;
}

export function parseProjectToolchainJson(json: string): ProjectToolchainFile | undefined {
  try {
    const o = JSON.parse(json) as { hdc?: unknown; ohVersion?: unknown; hdcPath?: unknown };
    const out: ProjectToolchainFile = {};
    if (typeof o.hdc === 'string' && o.hdc.trim()) out.hdc = o.hdc.trim();
    else if (typeof o.hdcPath === 'string' && o.hdcPath.trim()) out.hdc = o.hdcPath.trim();
    if (typeof o.ohVersion === 'string' && o.ohVersion.trim()) out.ohVersion = o.ohVersion.trim();
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}
