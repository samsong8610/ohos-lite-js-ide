/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { parseDeviceOhVersionText, type HdcToolchainOhVersion } from '@ohjs/core';
import type { HdcTransport } from './hdc-transport';

const PARAM_KEYS = [
  'const.product.software.version',
  'const.ohos.fullversion',
  'const.ohos.apiversion',
] as const;

export interface ProbeDeviceOhOptions {
  /** e.g. `/etc/ohjs/runtime-manifest.json` from the active device profile */
  firmwareManifestPath?: string;
}

/**
 * Best-effort OpenHarmony version read from a connected target (FR-DEP-007).
 * Uses the device profile manifest path when set, then standard `param get` keys.
 */
export async function probeDeviceOhVersion(
  transport: HdcTransport,
  targetKey: string,
  opts: ProbeDeviceOhOptions = {},
): Promise<HdcToolchainOhVersion | undefined> {
  if (opts.firmwareManifestPath) {
    const r = await transport.shell(targetKey, `cat '${opts.firmwareManifestPath.replace(/'/g, "'\\''")}'`);
    const fromManifest = parseDeviceOhVersionText(r.output);
    if (fromManifest) return fromManifest;
  }
  for (const key of PARAM_KEYS) {
    const r = await transport.shell(targetKey, `param get ${key}`);
    const parsed = parseDeviceOhVersionText(r.output);
    if (parsed) return parsed;
  }
  return undefined;
}
