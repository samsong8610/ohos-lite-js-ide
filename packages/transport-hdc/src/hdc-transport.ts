/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  OhjsError,
  isOhjsError,
  type CancellationToken,
  type CommandSpec,
  type DeviceInfo,
  type ErrorCode,
  type ForwardRule,
  type IDeviceTransport,
  type IForwardHandle,
  type IProcessRunner,
  type IStreamingProcess,
  type OutputEncoding,
  type ProcessResult,
  type ShellOptions,
  type ShellResult,
  type TransferOptions,
  type TransportCaps,
} from '@ohjs/core';
import { parseFileTransfer, type FileTransferStats } from './parser/file';
import { parseFportAdd, parseFportList, parseFportRemove } from './parser/fport';
import { findFailure, parseTconn, parseVersion, type HdcFailure } from './parser/messages';
import { parseShellOutput, wrapWithRc } from './parser/shell';
import { parseTargets } from './parser/targets';

export interface HdcTimeouts {
  listMs: number;
  connectMs: number;
  shellMs: number;
  fileMs: number;
  fportMs: number;
}

export const DEFAULT_HDC_TIMEOUTS: HdcTimeouts = {
  listMs: 10000,
  connectMs: 15000,
  shellMs: 30000,
  fileMs: 120000,
  fportMs: 10000,
};

export interface HdcTransportOptions {
  hdcPath: string;
  runner: IProcessRunner;
  /** extra global args, e.g. ['-s', '127.0.0.1:8710'] for a non-default server */
  globalArgs?: string[];
  timeouts?: Partial<HdcTimeouts>;
  encoding?: OutputEncoding;
  env?: Record<string, string>;
  /** retries for idempotent queries (ARCHITECTURE §13) */
  retries?: number;
}

/** HdcTransport (I-1, ARCHITECTURE §9.1): every hdc call goes through IProcessRunner. */
export class HdcTransport implements IDeviceTransport {
  readonly id = 'hdc' as const;
  private readonly timeouts: HdcTimeouts;

  constructor(private readonly opts: HdcTransportOptions) {
    this.timeouts = { ...DEFAULT_HDC_TIMEOUTS, ...opts.timeouts };
  }

  capabilities(): TransportCaps {
    return { forward: true, stream: true, fileTransfer: true };
  }

  /** Builds the argv for a command; exposed for tests and for logging. */
  command(args: string[], target?: string): CommandSpec {
    const t = target ? ['-t', target] : [];
    return {
      file: this.opts.hdcPath,
      args: [...(this.opts.globalArgs ?? []), ...t, ...args],
      env: this.opts.env,
    };
  }

  private async exec(
    args: string[],
    target: string | undefined,
    timeoutMs: number,
    token?: CancellationToken,
  ): Promise<{ result: ProcessResult; text: string; cmd: CommandSpec }> {
    const cmd = this.command(args, target);
    try {
      const result = await this.opts.runner.run(cmd, { timeoutMs, token, encoding: this.opts.encoding });
      return { result, text: result.stdout + (result.stderr ? '\n' + result.stderr : ''), cmd };
    } catch (e) {
      throw this.mapRunnerError(e, cmd);
    }
  }

  private mapRunnerError(e: unknown, cmd: CommandSpec): unknown {
    if (isOhjsError(e, 'PROC-TIMEOUT')) {
      return new OhjsError('TRN-HDC-TIMEOUT', `hdc ${cmd.args.join(' ')} timed out`, { ...e.detail, cmd }, e);
    }
    if (isOhjsError(e, 'PROC-CANCELLED')) {
      return new OhjsError(
        'TRN-HDC-CANCELLED',
        `hdc ${cmd.args.join(' ')} cancelled`,
        { ...e.detail, cmd },
        e,
      );
    }
    if (isOhjsError(e, 'ENV-TOOL-NOT-FOUND')) {
      return new OhjsError(
        'ENV-HDC-NOT-FOUND',
        `hdc not found at ${cmd.file}`,
        {
          cmd,
          hint: 'Set ohjs.tools.hdcPath or install the OpenHarmony SDK toolchains.',
        },
        e,
      );
    }
    return e;
  }

  private fail(f: HdcFailure, cmd: CommandSpec, raw: string, exitCode?: number | null): OhjsError {
    return new OhjsError(f.code, f.message, { cmd, raw, exitCode, hint: f.hint }, undefined);
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const retries = this.opts.retries ?? 1;
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        const retryable = isOhjsError(e, 'TRN-HDC-TIMEOUT') || isOhjsError(e, 'TRN-HDC-SERVER');
        if (!retryable || i >= retries) throw e;
      }
    }
  }

  async version(token?: CancellationToken): Promise<string | undefined> {
    const { text } = await this.exec(['-v'], undefined, this.timeouts.listMs, token);
    return parseVersion(text);
  }

  listTargets(token?: CancellationToken): Promise<DeviceInfo[]> {
    return this.withRetry(async () => {
      const { text, cmd, result } = await this.exec(
        ['list', 'targets', '-v'],
        undefined,
        this.timeouts.listMs,
        token,
      );
      const f = findFailure(text);
      if (f && f.code !== 'TRN-HDC-NO-TARGET') throw this.fail(f, cmd, text, result.exitCode);
      return parseTargets(text);
    });
  }

  async connect(endpoint: string, token?: CancellationToken): Promise<void> {
    if (!/^[^\s:]+:\d{1,5}$/.test(endpoint) && !/^\[[0-9a-fA-F:]+\]:\d{1,5}$/.test(endpoint)) {
      throw new OhjsError('TRN-HDC-CONNECT-FAILED', `invalid endpoint "${endpoint}", expected ip:port`);
    }
    const { text, cmd, result } = await this.exec(
      ['tconn', endpoint],
      undefined,
      this.timeouts.connectMs,
      token,
    );
    const r = parseTconn(text);
    if (!r.ok) throw this.fail(r.failure!, cmd, text, result.exitCode);
  }

  async shell(target: string, cmd: string, opts: ShellOptions = {}): Promise<ShellResult> {
    const {
      text,
      cmd: spec,
      result,
    } = await this.exec(
      ['shell', wrapWithRc(cmd)],
      target,
      opts.timeoutMs ?? this.timeouts.shellMs,
      opts.token,
    );
    const f = findFailure(text);
    const parsed = parseShellOutput(result.stdout);
    // a [Fail] line from hdc itself (not from the device command) means the shell never ran
    if (f && parsed.exitCode === null) throw this.fail(f, spec, text, result.exitCode);
    return { exitCode: parsed.exitCode, output: parsed.output };
  }

  shellStream(target: string, cmd: string): IStreamingProcess {
    return this.opts.runner.spawnStream(this.command(['shell', cmd], target), {
      encoding: this.opts.encoding,
    });
  }

  private async transfer(
    verb: 'send' | 'recv',
    target: string,
    a: string,
    b: string,
    opts: TransferOptions,
  ): Promise<FileTransferStats> {
    const { text, cmd, result } = await this.exec(
      ['file', verb, a, b],
      target,
      opts.timeoutMs ?? this.timeouts.fileMs,
      opts.token,
    );
    const r = parseFileTransfer(text);
    if (!r.ok) throw this.fail(r.failure, cmd, text, result.exitCode);
    return r.stats;
  }

  async push(target: string, local: string, remote: string, opts: TransferOptions = {}): Promise<void> {
    await this.pushWithStats(target, local, remote, opts);
  }

  pushWithStats(
    target: string,
    local: string,
    remote: string,
    opts: TransferOptions = {},
  ): Promise<FileTransferStats> {
    return this.transfer('send', target, local, remote, opts);
  }

  async pull(target: string, remote: string, local: string, opts: TransferOptions = {}): Promise<void> {
    await this.transfer('recv', target, remote, local, opts);
  }

  async listForwards(token?: CancellationToken): Promise<ForwardRule[]> {
    return this.withRetry(async () => {
      const { text } = await this.exec(['fport', 'ls'], undefined, this.timeouts.fportMs, token);
      return parseFportList(text);
    });
  }

  async forward(
    target: string,
    local: number,
    remote: number,
    token?: CancellationToken,
  ): Promise<IForwardHandle> {
    for (const p of [local, remote]) {
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        throw new OhjsError('TRN-HDC-FPORT', `invalid port ${p}`);
      }
    }
    const rule = [`tcp:${local}`, `tcp:${remote}`];
    const { text, cmd, result } = await this.exec(['fport', ...rule], target, this.timeouts.fportMs, token);
    const r = parseFportAdd(text);
    if (!r.ok) throw this.fail(r.failure!, cmd, text, result.exitCode);
    let removed = false;
    return {
      local,
      remote,
      remove: async () => {
        if (removed) return;
        const res = await this.exec(['fport', 'rm', ...rule], target, this.timeouts.fportMs);
        const rr = parseFportRemove(res.text);
        if (!rr.ok) throw this.fail(rr.failure!, res.cmd, res.text, res.result.exitCode);
        removed = true;
      },
    };
  }
}

export function isTransportError(e: unknown, code?: ErrorCode): e is OhjsError {
  return isOhjsError(e) && e.code.startsWith('TRN-') && (code === undefined || e.code === code);
}
