/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHostPlatform, NodeProcessRunner, type IForwardHandle } from '@ohjs/core';
import { sourceNameMatches } from '@ohjs/jerry-debug-client';
import type {
  JerryDebugClient,
  JerryBreakpoint,
  JerryOutputEvent,
  JerryStoppedEvent,
} from '@ohjs/jerry-debug-client';
import { HdcTransport, LiteDeployService } from '@ohjs/transport-hdc';
import {
  LoggingDebugSession,
  InitializedEvent,
  StoppedEvent,
  TerminatedEvent,
  OutputEvent,
  Breakpoint,
  BreakpointEvent,
  Thread,
  StackFrame,
  Scope,
  Source,
} from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { launchJerryOnDevice, teardownJerryOnDevice } from './device-lifecycle.js';
import type { OhjsLaunchRequestArguments } from './launch-args.js';
import { breakpointSourceName, resolveLocalSourcePath } from './source-paths.js';

function mergeHdcEnv(hdcServer?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null) out[k] = v;
  }
  if (hdcServer?.trim()) {
    const s = hdcServer.trim();
    out.OHOS_HDC_SERVER_PORT = s.includes(':') ? s.split(':').pop()! : s;
  }
  return out;
}

function outputCategory(ev: JerryOutputEvent): string {
  return ev.category === 'error' || ev.category === 'warning' ? 'stderr' : 'stdout';
}

export class OhjsDebugSession extends LoggingDebugSession {
  private client?: JerryDebugClient;
  private forward?: IForwardHandle;
  private deploy?: LiteDeployService;
  private transport?: HdcTransport;
  private runner?: NodeProcessRunner;
  private launchArgs?: OhjsLaunchRequestArguments;
  private sourceCache = new Map<string, string | undefined>();
  private pendingBpByFile = new Map<string, DebugProtocol.SourceBreakpoint[]>();
  private stopOnEntry = true;
  private threadId = 1;

  public constructor() {
    super('ohjs-debug.log');
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected override initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    response.body = response.body ?? {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsEvaluateForHovers = true;
    response.body.supportsConditionalBreakpoints = false;
    response.body.supportsHitConditionalBreakpoints = false;
    response.body.supportsLogPoints = false;
    response.body.supportsSetVariable = false;
    response.body.supportsRestartRequest = false;
    response.body.supportsStepBack = false;
    response.body.supportsCancelRequest = false;
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments,
  ): Promise<void> {
    const launch = args as OhjsLaunchRequestArguments;
    this.launchArgs = launch;
    this.stopOnEntry = launch.stopOnEntry !== false;
    try {
      const platform = createHostPlatform();
      this.runner = new NodeProcessRunner(platform);
      this.transport = new HdcTransport({
        hdcPath: launch.hdcPath,
        runner: this.runner,
        env: mergeHdcEnv(launch.hdcServer),
      });
      this.deploy = new LiteDeployService({ transport: this.transport, profile: launch.deviceProfile });
      if (launch.preDeploy && launch.hapPath) {
        const { remotePath } = await this.deploy.deployHap(launch.target, launch.hapPath);
        await this.deploy.install(launch.target, remotePath);
      }
      const localPort = launch.localPort ?? 19001;
      const remoteDebugPort = launch.deviceProfile.debug.port;
      const { client, forward } = await launchJerryOnDevice(
        { transport: this.transport, deploy: this.deploy },
        {
          target: launch.target,
          bundle: launch.bundle,
          ability: launch.ability,
          localPort,
          remoteDebugPort,
        },
      );
      this.client = client;
      this.forward = forward;
      this.wireClient(client);
      if (client.stopped) {
        this.sendStopped(client.location ? 'entry' : 'pause');
      }
      this.sendResponse(response);
    } catch (e) {
      this.sendErrorResponse(response, 1001, (e as Error).message);
    }
  }

  private wireClient(client: JerryDebugClient): void {
    client.on('stopped', (ev: JerryStoppedEvent) => {
      const reason = ev.reason === 'breakpoint' ? 'breakpoint' : ev.reason === 'step' ? 'step' : 'pause';
      this.sendStopped(reason);
    });
    client.on('output', (ev: JerryOutputEvent) => {
      this.sendEvent(new OutputEvent(ev.text, outputCategory(ev)));
    });
    client.on('breakpointResolved', (bp: JerryBreakpoint) => {
      this.sendBreakpointEvent(bp);
    });
    client.on('scriptParsed', () => {
      this.applyPendingBreakpoints();
    });
    client.on('close', () => {
      void this.endSession();
      this.sendEvent(new TerminatedEvent());
    });
    client.on('error', (err: Error) => {
      this.sendEvent(new OutputEvent(`${err.message}\n`, 'stderr'));
    });
  }

  private sendStopped(reason: string): void {
    this.sendEvent(new StoppedEvent(reason, this.threadId));
  }

  private sendBreakpointEvent(bp: JerryBreakpoint): void {
    const local = resolveLocalSourcePath(bp.sourceName, this.launchArgs?.workspaceFolder, this.sourceCache);
    if (!local) return;
    this.sendEvent(
      new BreakpointEvent('changed', {
        id: bp.id,
        verified: bp.verified,
        line: bp.line,
        source: { path: local },
      }),
    );
  }

  protected override configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse): void {
    this.applyPendingBreakpoints();
    if (!this.stopOnEntry && this.client?.stopped) {
      this.client.continue();
    }
    this.sendResponse(response);
  }

  protected override setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): void {
    const sourcePath = args.source?.path;
    if (!sourcePath) {
      response.body = { breakpoints: [] };
      this.sendResponse(response);
      return;
    }
    const req = args.breakpoints ?? [];
    this.pendingBpByFile.set(sourcePath, req);
    const bps = this.applyBreakpointsForFile(sourcePath, req);
    response.body = { breakpoints: bps };
    this.sendResponse(response);
  }

  private applyPendingBreakpoints(): void {
    for (const [file, req] of this.pendingBpByFile) {
      this.applyBreakpointsForFile(file, req);
    }
  }

  private applyBreakpointsForFile(sourcePath: string, req: DebugProtocol.SourceBreakpoint[]): Breakpoint[] {
    const client = this.client;
    if (!client) {
      return req.map((r) => new Breakpoint(false, r.line));
    }
    const jerryName = breakpointSourceName(sourcePath, this.launchArgs?.workspaceFolder);
    const source = new Source(pathBasename(sourcePath), sourcePath);
    const existing = client.breakpointList.filter((b) => sourceNameMatches(jerryName, b.sourceName));
    for (const b of existing) client.clearBreakpoint(b.id);

    const out: Breakpoint[] = [];
    for (const r of req) {
      const lines = client.breakableLines(jerryName);
      const breakable = lines.includes(r.line);
      const bp = breakable ? client.setBreakpoint(jerryName, r.line) : undefined;
      out.push(new Breakpoint(!!bp?.verified, r.line, undefined, source));
    }
    return out;
  }

  protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = { threads: [new Thread(this.threadId, 'main')] };
    this.sendResponse(response);
  }

  protected override async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments,
  ): Promise<void> {
    const client = this.client;
    if (!client?.stopped) {
      this.sendErrorResponse(response, 2001, 'Not stopped');
      return;
    }
    const start = args.startFrame ?? 0;
    const levels = args.levels ?? 20;
    const bt = await client.backtrace({ total: true, minDepth: start, maxDepth: start + levels });
    const frames: StackFrame[] = bt.frames.map((f) => {
      const loc = f.location;
      const srcPath =
        loc && resolveLocalSourcePath(loc.sourceName, this.launchArgs?.workspaceFolder, this.sourceCache);
      const source = srcPath ? new Source(pathBasename(srcPath), srcPath) : undefined;
      const name = loc?.functionName ? loc.functionName : '(program)';
      return new StackFrame(f.index, name, source, loc?.line ?? 0);
    });
    response.body = { stackFrames: frames, totalFrames: bt.total ?? frames.length };
    this.sendResponse(response);
  }

  protected override async scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments,
  ): Promise<void> {
    const client = this.client;
    if (!client?.stopped) {
      this.sendErrorResponse(response, 2002, 'Not stopped');
      return;
    }
    const chain = await client.scopeChain();
    const scopes = chain.map((s) => new Scope(s.kindName, s.level, false));
    response.body = { scopes };
    this.sendResponse(response);
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    const client = this.client;
    const level = args.variablesReference;
    if (!client?.stopped || level < 0) {
      response.body = { variables: [] };
      this.sendResponse(response);
      return;
    }
    const vars = await client.scopeVariables(level);
    response.body = {
      variables: vars.map((v) => ({
        name: v.name,
        value: v.value,
        type: v.typeName,
        variablesReference: 0,
        evaluateName: v.name,
      })),
    };
    this.sendResponse(response);
  }

  protected override async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {
    const client = this.client;
    if (!client?.stopped) {
      this.sendErrorResponse(response, 2003, 'Not stopped');
      return;
    }
    const frame = args.frameId ?? 0;
    const r = await client.evaluate(args.expression, frame);
    response.body = {
      result: r.ok ? r.value : r.value,
      variablesReference: 0,
      ...(r.ok ? {} : { presentationHint: { attributes: ['invalid'] } }),
    };
    this.sendResponse(response);
  }

  protected override continueRequest(response: DebugProtocol.ContinueResponse): void {
    try {
      this.client?.continue();
      response.body = { allThreadsContinued: true };
      this.sendResponse(response);
    } catch (e) {
      this.sendErrorResponse(response, 2004, (e as Error).message);
    }
  }

  protected override nextRequest(response: DebugProtocol.NextResponse): void {
    try {
      this.client?.stepOver();
      this.sendResponse(response);
    } catch (e) {
      this.sendErrorResponse(response, 2005, (e as Error).message);
    }
  }

  protected override stepInRequest(response: DebugProtocol.StepInResponse): void {
    try {
      this.client?.stepIn();
      this.sendResponse(response);
    } catch (e) {
      this.sendErrorResponse(response, 2006, (e as Error).message);
    }
  }

  protected override stepOutRequest(response: DebugProtocol.StepOutResponse): void {
    try {
      this.client?.stepOut();
      this.sendResponse(response);
    } catch (e) {
      this.sendErrorResponse(response, 2007, (e as Error).message);
    }
  }

  protected override pauseRequest(response: DebugProtocol.PauseResponse): void {
    try {
      this.client?.pause();
      this.sendResponse(response);
    } catch (e) {
      this.sendErrorResponse(response, 2008, (e as Error).message);
    }
  }

  protected override async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
  ): Promise<void> {
    await this.endSession();
    this.sendResponse(response);
  }

  protected override async terminateRequest(
    response: DebugProtocol.TerminateResponse,
    _args: DebugProtocol.TerminateArguments,
  ): Promise<void> {
    await this.endSession();
    this.sendResponse(response);
    this.sendEvent(new TerminatedEvent());
  }

  private async endSession(): Promise<void> {
    const launch = this.launchArgs;
    if (launch && this.deploy) {
      await teardownJerryOnDevice({ deploy: this.deploy }, launch.target, this.client, this.forward);
    } else {
      try {
        this.client?.close();
      } catch {
        /* ignore */
      }
      try {
        await this.forward?.remove();
      } catch {
        /* ignore */
      }
    }
    this.client = undefined;
    this.forward = undefined;
    this.runner?.disposeAll();
    this.runner = undefined;
  }
}

function pathBasename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}
