/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CancellationToken } from '../cancellation';
import type { IStreamingProcess } from '../platform/types';

export type ConnType = 'USB' | 'TCP' | 'UART' | 'BT' | 'UNKNOWN';
export type ConnState = 'Connected' | 'Ready' | 'Offline' | 'Unauthorized' | 'Unknown';

export interface DeviceInfo {
  key: string;
  connType: ConnType;
  state: ConnState;
  name?: string;
}

export interface ShellOptions {
  timeoutMs?: number;
  token?: CancellationToken;
}
export interface ShellResult {
  exitCode: number | null;
  output: string;
}
export interface TransferOptions {
  timeoutMs?: number;
  token?: CancellationToken;
}
export interface ForwardRule {
  key: string;
  local: string;
  remote: string;
  direction: 'forward' | 'reverse';
}
export interface IForwardHandle {
  readonly local: number;
  readonly remote: number;
  remove(): Promise<void>;
}
export interface TransportCaps {
  forward: boolean;
  stream: boolean;
  fileTransfer: boolean;
}

/** ARCHITECTURE §9.1, FR-DEP-007, NFR-PLT-003. */
export interface IDeviceTransport {
  readonly id: 'hdc' | 'ssh' | 'serial';
  listTargets(token?: CancellationToken): Promise<DeviceInfo[]>;
  connect(endpoint: string, token?: CancellationToken): Promise<void>;
  shell(target: string, cmd: string, opts?: ShellOptions): Promise<ShellResult>;
  shellStream(target: string, cmd: string): IStreamingProcess;
  push(target: string, local: string, remote: string, opts?: TransferOptions): Promise<void>;
  pull(target: string, remote: string, local: string, opts?: TransferOptions): Promise<void>;
  forward?(target: string, local: number, remote: number, token?: CancellationToken): Promise<IForwardHandle>;
  capabilities(): TransportCaps;
}
