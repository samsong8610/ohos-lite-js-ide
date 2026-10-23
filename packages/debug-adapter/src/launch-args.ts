/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { DeviceProfile } from '@ohjs/core';
import type { DebugProtocol } from '@vscode/debugprotocol';

/** Arguments for `type: ohjs` launch (filled by the extension configuration provider). */
export interface OhjsLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** Hdc target key (e.g. USB serial or `127.0.0.1:8710`). */
  target: string;
  bundle: string;
  ability: string;
  hdcPath: string;
  /** Resolved device profile (paths, commands, debug.port). */
  deviceProfile: DeviceProfile;
  hdcServer?: string;
  /** Host tcp port forwarded to device Jerry port (default 19001). */
  localPort?: number;
  /** When true, deploy `hapPath` before starting debug (clears markers per deploy contract). */
  preDeploy?: boolean;
  hapPath?: string;
  /** Workspace root for mapping Jerry source names to local paths. */
  workspaceFolder?: string;
  stopOnEntry?: boolean;
  trace?: boolean;
}
