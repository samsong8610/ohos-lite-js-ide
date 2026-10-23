/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CancellationToken, IForwardHandle } from '@ohjs/core';
import type { JerryDebugClient } from '@ohjs/jerry-debug-client';
import { JerryDebugClient as DefaultJerryClient } from '@ohjs/jerry-debug-client';
import type { HdcTransport } from '@ohjs/transport-hdc';
import { shellCreateDebugMarker, type LiteDeployService } from '@ohjs/transport-hdc';

export interface DebugLaunchParams {
  target: string;
  bundle: string;
  ability: string;
  /** Host-side tcp port for `hdc fport tcp:<local> tcp:<remote>`. */
  localPort: number;
  /** Device Jerry debugger port (profile `debug.port`, default 5001). */
  remoteDebugPort: number;
  connectHost?: string;
  connectTimeoutMs?: number;
  /** qemu `jsdebug` mode: Jerry already running — skip marker and `aa start`. */
  skipAppStart?: boolean;
}

export interface DebugLaunchResult {
  client: JerryDebugClient;
  forward: IForwardHandle;
}

export type JerryConnectFn = (opts: {
  host: string;
  port: number;
  timeoutMs?: number;
}) => Promise<JerryDebugClient>;

export interface DebugLaunchDeps {
  transport: HdcTransport;
  deploy: LiteDeployService;
  connect?: JerryConnectFn;
}

/** Device contract: marker → aa start → fport → Jerry connect → delete marker. */
export async function launchJerryOnDevice(
  deps: DebugLaunchDeps,
  params: DebugLaunchParams,
  token?: CancellationToken,
): Promise<DebugLaunchResult> {
  const connect = deps.connect ?? ((o) => DefaultJerryClient.connect(o));
  const host = params.connectHost ?? '127.0.0.1';
  let forward: IForwardHandle | undefined;

  const cleanup = async (): Promise<void> => {
    try {
      await forward?.remove();
    } catch {
      /* ignore */
    }
    forward = undefined;
    await deps.deploy.clearDebugMarkers(params.target, token);
  };

  try {
    if (!params.skipAppStart) {
      const markerCmd = shellCreateDebugMarker(params.bundle);
      await deps.transport.shell(params.target, markerCmd, { token });
      await deps.deploy.startApp(params.target, { bundle: params.bundle, ability: params.ability }, token);
    }
    forward = await deps.transport.forward(params.target, params.localPort, params.remoteDebugPort, token);
    let client: JerryDebugClient;
    try {
      client = await connect({
        host,
        port: params.localPort,
        timeoutMs: params.connectTimeoutMs ?? 15000,
      });
    } catch (e) {
      await cleanup();
      throw e;
    }
    if (!params.skipAppStart) {
      await deps.deploy.clearDebugMarkers(params.target, token);
    }
    return { client, forward };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/** End debug session: close client, remove fport, clear markers. */
export async function teardownJerryOnDevice(
  deps: Pick<DebugLaunchDeps, 'deploy'>,
  target: string,
  client: JerryDebugClient | undefined,
  forward: IForwardHandle | undefined,
  token?: CancellationToken,
): Promise<void> {
  try {
    client?.close();
  } catch {
    /* ignore */
  }
  try {
    await forward?.remove();
  } catch {
    /* ignore */
  }
  await deps.deploy.clearDebugMarkers(target, token);
}
