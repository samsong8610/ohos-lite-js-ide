/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  OhjsError,
  renderCommand,
  type CancellationToken,
  type DeviceProfile,
  type IStreamingProcess,
} from '@ohjs/core';
import type { HdcTransport } from '../hdc-transport';
import {
  parseAaStartOutput,
  parseAaTerminateOutput,
  parseBmInstallOutput,
  parseBmSetDisableOutput,
  parseBmUninstallOutput,
} from './bm-aa';
import { shellClearDebugMarkers } from './debug-markers';
import {
  defaultLogCapturePaths,
  shellStartLogCapture,
  shellStopLogCapture,
  shellTailLogCapture,
} from './log-capture';

export interface DeployAppIdentity {
  bundle: string;
  ability: string;
}

export interface DeployPreflight {
  firmware: 'debug' | 'release';
  warning?: string;
}

export interface LiteDeployServiceOptions {
  transport: HdcTransport;
  profile: DeviceProfile;
}

/** Deploy / install / launch / logs for OpenHarmony lite (bm/aa + hdc file send). */
export class LiteDeployService {
  constructor(private readonly opts: LiteDeployServiceOptions) {}

  private remoteHapPath(): string {
    const dir = this.opts.profile.paths.tmpDir.replace(/\/$/, '');
    return `${dir}/app.hap`;
  }

  async clearDebugMarkers(target: string, token?: CancellationToken): Promise<void> {
    const cmd = shellClearDebugMarkers();
    await this.opts.transport.shell(target, cmd, { token });
  }

  async preflightDebugFirmware(target: string, token?: CancellationToken): Promise<DeployPreflight> {
    const tpl = this.opts.profile.commands.disableSignCheck;
    const cmd = renderCommand(tpl, { tmpDir: this.opts.profile.paths.tmpDir });
    const { output } = await this.opts.transport.shell(target, cmd, { token });
    const firmware = parseBmSetDisableOutput(output);
    if (firmware === 'release') {
      return {
        firmware,
        warning:
          'Firmware does not report debug mode (bm set -s disable did not return success). Signed HAP install may fail.',
      };
    }
    return { firmware };
  }

  async ensureTmpDir(target: string, token?: CancellationToken): Promise<void> {
    const cmd = renderCommand(this.opts.profile.commands.mkTmp, {
      tmpDir: this.opts.profile.paths.tmpDir,
    });
    await this.opts.transport.shell(target, cmd, { token });
  }

  async deployHap(
    target: string,
    localHap: string,
    token?: CancellationToken,
  ): Promise<{ remotePath: string }> {
    if (!localHap.toLowerCase().endsWith('.hap')) {
      throw new OhjsError('DEP-HAP-PATH', 'Local artifact must be a .hap file', { hint: localHap });
    }
    await this.clearDebugMarkers(target, token);
    await this.ensureTmpDir(target, token);
    const remotePath = this.remoteHapPath();
    await this.opts.transport.push(target, localHap, remotePath, { token });
    return { remotePath };
  }

  async install(target: string, remoteHap: string, token?: CancellationToken): Promise<void> {
    const cmd = renderCommand(this.opts.profile.commands.install, { hap: remoteHap });
    const { output } = await this.opts.transport.shell(target, cmd, { token });
    const r = parseBmInstallOutput(output);
    if (!r.ok) {
      await this.clearDebugMarkers(target, token);
      throw new OhjsError('DEP-INSTALL-FAILED', r.message, { raw: output });
    }
  }

  async uninstall(target: string, bundle: string, token?: CancellationToken): Promise<void> {
    const cmd = renderCommand(this.opts.profile.commands.uninstall, { bundle });
    const { output } = await this.opts.transport.shell(target, cmd, { token });
    const r = parseBmUninstallOutput(output);
    if (!r.ok) throw new OhjsError('DEP-UNINSTALL-FAILED', r.message, { raw: output });
  }

  async startApp(target: string, app: DeployAppIdentity, token?: CancellationToken): Promise<void> {
    const cmd = renderCommand(this.opts.profile.commands.start, {
      bundle: app.bundle,
      ability: app.ability,
    });
    const { output } = await this.opts.transport.shell(target, cmd, { token });
    const r = parseAaStartOutput(output);
    if (!r.ok) {
      await this.clearDebugMarkers(target, token);
      throw new OhjsError('DEP-START-FAILED', r.message, { raw: output });
    }
  }

  async stopApp(target: string, bundle: string, token?: CancellationToken): Promise<void> {
    const cmd = renderCommand(this.opts.profile.commands.stop, { bundle });
    const { output } = await this.opts.transport.shell(target, cmd, { token });
    parseAaTerminateOutput(output);
  }

  async deployInstallLaunch(
    target: string,
    localHap: string,
    app: DeployAppIdentity,
    token?: CancellationToken,
  ): Promise<void> {
    const { remotePath } = await this.deployHap(target, localHap, token);
    await this.install(target, remotePath, token);
    await this.startApp(target, app, token);
  }

  async startLogCapture(target: string, token?: CancellationToken): Promise<void> {
    const paths = defaultLogCapturePaths(this.opts.profile.paths.tmpDir);
    await this.ensureTmpDir(target, token);
    await this.opts.transport.shell(target, shellStartLogCapture(paths), { token });
  }

  async stopLogCapture(target: string, token?: CancellationToken): Promise<void> {
    const paths = defaultLogCapturePaths(this.opts.profile.paths.tmpDir);
    await this.opts.transport.shell(target, shellStopLogCapture(paths), { token });
  }

  tailLogStream(target: string): IStreamingProcess {
    const paths = defaultLogCapturePaths(this.opts.profile.paths.tmpDir);
    return this.opts.transport.shellStream(target, shellTailLogCapture(paths.captureFile));
  }
}
