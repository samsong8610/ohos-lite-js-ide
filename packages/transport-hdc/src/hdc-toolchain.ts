/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ToolLocator,
  normalizeHdcToolchainOhVersion,
  type DeviceInfo,
  type HdcToolchainOhVersion,
  type IPlatform,
  type IProcessRunner,
  type LocatedTool,
  type ProjectToolchainFile,
} from '@ohjs/core';
import { probeDeviceOhVersion, type ProbeDeviceOhOptions } from './device-oh-probe';
import { HdcTransport } from './hdc-transport';

export type DeviceOhProber = (
  transport: HdcTransport,
  targetKey: string,
  opts?: ProbeDeviceOhOptions,
) => Promise<HdcToolchainOhVersion | undefined>;

export interface HdcToolchainContext {
  /** ohjs.tools.hdcPath — when set, skips version-aware re-selection */
  userHdcPath?: string;
  /** ohjs.tools.hdcOhVersion — force toolchain when autodetection fails */
  ohVersionOverride?: string;
  /** SDK / project hint used before a device is probed */
  fallbackOhVersion?: string;
  projectToolchain?: ProjectToolchainFile;
  extensionDir?: string;
  firmwareManifestPath?: string;
  runner: IProcessRunner;
  env?: Record<string, string>;
}

export interface ResolvedHdcToolchain {
  located: LocatedTool;
  /** normalized OpenHarmony bucket used for lookup */
  ohToolchain?: string;
  /** raw text-derived version from the device, when probed */
  deviceOhVersion?: string;
}

function hintsFrom(ctx: HdcToolchainContext, ohToolchain?: string) {
  return {
    user: ctx.userHdcPath,
    project: ctx.projectToolchain?.hdc,
    extensionDir: ctx.extensionDir,
    ohToolchain:
      ohToolchain ?? ctx.ohVersionOverride ?? ctx.projectToolchain?.ohVersion ?? ctx.fallbackOhVersion,
  };
}

/** Resolves host `hdc` for deploy / list (NFR-DST-004, FR-DEP-007). */
export class HdcToolchainResolver {
  private readonly locator: ToolLocator;

  constructor(
    private readonly platform: IPlatform,
    locator?: ToolLocator,
    private readonly probeDevice: DeviceOhProber = probeDeviceOhVersion,
  ) {
    this.locator = locator ?? new ToolLocator(platform);
  }

  locate(ctx: HdcToolchainContext, ohToolchain?: string): LocatedTool {
    return this.locator.locate('hdc', hintsFrom(ctx, ohToolchain));
  }

  /**
   * Picks `hdc` for listing or deploy: explicit user path wins; otherwise uses SDK/project hints,
   * then re-locates after reading the device OpenHarmony version when exactly one target is connected.
   */
  async resolve(ctx: HdcToolchainContext, targets?: DeviceInfo[]): Promise<ResolvedHdcToolchain> {
    if (ctx.userHdcPath?.trim()) {
      const located = this.locate(ctx);
      return { located, ohToolchain: normalizeHdcToolchainOhVersion(ctx.ohVersionOverride) };
    }

    let ohHint =
      normalizeHdcToolchainOhVersion(ctx.ohVersionOverride) ??
      normalizeHdcToolchainOhVersion(ctx.projectToolchain?.ohVersion) ??
      normalizeHdcToolchainOhVersion(ctx.fallbackOhVersion);

    let located = this.locate(ctx, ohHint);
    const connected = (targets ?? []).filter((t) => t.state === 'Connected' || t.state === 'Ready');
    if (connected.length !== 1) {
      return { located, ohToolchain: ohHint };
    }

    const bootstrap = new HdcTransport({
      hdcPath: located.path,
      runner: ctx.runner,
      env: ctx.env,
    });
    const probed = await this.probeDevice(bootstrap, connected[0]!.key, {
      firmwareManifestPath: ctx.firmwareManifestPath,
    });
    if (!probed) {
      return { located, ohToolchain: ohHint };
    }
    if (probed !== ohHint) {
      ohHint = probed;
      located = this.locate(ctx, ohHint);
    }
    return { located, ohToolchain: ohHint, deviceOhVersion: probed };
  }
}
