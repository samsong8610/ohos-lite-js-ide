/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandKey } from './schema';

export type ConnectionKind = 'usb' | 'tcp';

export interface DeviceProfileInput {
  $schema?: string;
  id: string;
  extends?: string;
  name?: string;
  description?: string;
  arch?: 'loongarch64' | 'arm' | 'arm64' | 'riscv64' | 'x86_64';
  kernel?: 'linux' | 'liteos_a';
  deviceType?: 'smartVision' | 'liteWearable';
  display?: Partial<DisplaySpec>;
  features?: Record<string, boolean>;
  featuresSource?: string;
  connection?: Partial<ConnectionSpec>;
  paths?: Partial<DevicePaths>;
  commands?: Partial<Record<CommandKey, string>>;
  debug?: Partial<DebugSpec>;
  jerry?: Partial<JerrySpec>;
  timeouts?: Partial<TimeoutSpec>;
}

export interface DisplaySpec {
  width: number;
  height: number;
  shape: 'rect' | 'round';
  dpi?: number | null;
}
export interface ConnectionSpec {
  preferred: ConnectionKind;
  fallback: ConnectionKind[];
  tcpHost?: string;
  tcpPort: number;
  usbSerial?: string;
}
export interface DevicePaths {
  tmpDir: string;
  snapshotFlag: string;
  appInstallRoot: string;
  firmwareManifest?: string;
  hilogcat?: string;
}
export interface DebugSpec {
  port: number;
  enableMethod?: 'flagFile' | 'none';
  enableFlag?: string;
  requireDebugFirmware?: boolean;
}
export interface JerrySpec {
  snapshotVersion?: number;
  debuggerProtocol?: number;
  cpointer32?: boolean | null;
}
export interface TimeoutSpec {
  shellMs: number;
  fileSendMinMs: number;
  fileSendBytesPerSec: number;
}

/** Fully resolved profile (after extends + overrides). */
export interface DeviceProfile {
  id: string;
  name: string;
  description?: string;
  arch: NonNullable<DeviceProfileInput['arch']>;
  kernel: NonNullable<DeviceProfileInput['kernel']>;
  deviceType: NonNullable<DeviceProfileInput['deviceType']>;
  display: DisplaySpec;
  features: Record<string, boolean>;
  featuresSource?: string;
  connection: ConnectionSpec;
  paths: DevicePaths;
  commands: Record<CommandKey, string>;
  debug: DebugSpec;
  jerry: JerrySpec;
  timeouts: TimeoutSpec;
  /** ids from most specific to base */
  lineage: string[];
}

export const DEFAULT_TIMEOUTS: TimeoutSpec = {
  shellMs: 30000,
  fileSendMinMs: 120000,
  fileSendBytesPerSec: 256 * 1024,
};
