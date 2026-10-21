/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { TextDecoder } from 'util';
import { OhjsError } from '../errors';
import { decodeOutput } from './encoding';
import type {
  CommandSpec,
  IPlatform,
  IProcessRunner,
  IStreamingProcess,
  OutputEncoding,
  ProcessResult,
  RunOptions,
} from './types';
import { buildCmdShellArgs, isBatchFile } from './win32/escape';

export interface SpawnPlan {
  file: string;
  args: string[];
  options: SpawnOptions;
}

/**
 * Pure: how a CommandSpec is turned into a spawn call on a given platform.
 * - Windows .bat/.cmd → cmd.exe /d /s /c "<escaped>" (windowsVerbatimArguments), never shell:true.
 * - Windows .exe and posix → direct spawn, no shell.
 * - posix children get their own process group (detached) so the whole tree can be killed.
 */
export function planSpawn(platform: IPlatform, cmd: CommandSpec): SpawnPlan {
  const env = cmd.env ? platform.mergeEnv(cmd.env) : undefined;
  const base: SpawnOptions = { cwd: cmd.cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] };
  if (platform.kind === 'win32') {
    if (isBatchFile(cmd.file)) {
      return {
        file: 'cmd.exe',
        args: buildCmdShellArgs(cmd.file, cmd.args),
        options: { ...base, windowsVerbatimArguments: true },
      };
    }
    return { file: cmd.file, args: [...cmd.args], options: base };
  }
  return { file: cmd.file, args: [...cmd.args], options: { ...base, detached: true } };
}

export type TreeKiller = (pid: number) => Promise<void>;

/** Process-tree kill: Windows `taskkill /T /F`, posix kill(-pgid). */
export function createTreeKiller(platform: IPlatform): TreeKiller {
  if (platform.kind === 'win32') {
    return (pid) =>
      new Promise((resolve) => {
        const k = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
          windowsHide: true,
          stdio: 'ignore',
        });
        k.on('error', () => resolve());
        k.on('exit', () => resolve());
      });
  }
  return async (pid) => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  };
}

function concat(chunks: Buffer[]): Uint8Array {
  return new Uint8Array(Buffer.concat(chunks));
}

export class NodeProcessRunner implements IProcessRunner {
  private readonly live = new Set<ChildProcess>();
  private readonly killTree: TreeKiller;

  constructor(
    private readonly platform: IPlatform,
    private readonly defaults: { encoding?: OutputEncoding } = {},
    killer?: TreeKiller,
  ) {
    this.killTree = killer ?? createTreeKiller(platform);
  }

  get liveCount(): number {
    return this.live.size;
  }

  private start(cmd: CommandSpec): ChildProcess {
    const plan = planSpawn(this.platform, cmd);
    const child = spawn(plan.file, plan.args, plan.options);
    this.live.add(child);
    child.once('close', () => this.live.delete(child));
    child.once('error', () => this.live.delete(child));
    return child;
  }

  private async kill(child: ChildProcess): Promise<void> {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      await this.killTree(child.pid);
    }
  }

  run(cmd: CommandSpec, opts: RunOptions = {}): Promise<ProcessResult> {
    const encoding = opts.encoding ?? this.defaults.encoding ?? 'auto';
    if (opts.token?.isCancellationRequested) {
      return Promise.reject(new OhjsError('PROC-CANCELLED', `cancelled before start: ${cmd.file}`, { cmd }));
    }
    return new Promise<ProcessResult>((resolve, reject) => {
      const started = Date.now();
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      // eslint-disable-next-line prefer-const -- assigned after finish() is defined, read inside it
      let sub: { dispose(): void } | undefined;
      let child: ChildProcess;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        sub?.dispose();
        fn();
      };
      const partial = (): string => decodeOutput(concat(out), encoding) + decodeOutput(concat(err), encoding);

      try {
        child = this.start(cmd);
      } catch (e) {
        reject(
          new OhjsError(
            'PROC-SPAWN-FAILED',
            `failed to start ${cmd.file}: ${(e as Error).message}`,
            { cmd },
            e,
          ),
        );
        return;
      }
      child.stdout?.on('data', (d: Buffer) => out.push(d));
      child.stderr?.on('data', (d: Buffer) => err.push(d));
      child.on('error', (e: NodeJS.ErrnoException) => {
        const code = e.code === 'ENOENT' ? 'ENV-TOOL-NOT-FOUND' : 'PROC-SPAWN-FAILED';
        finish(() => reject(new OhjsError(code, `failed to start ${cmd.file}: ${e.message}`, { cmd }, e)));
      });
      child.on('close', (exitCode, signal) => {
        finish(() => {
          const stdoutRaw = concat(out);
          const stderrRaw = concat(err);
          resolve({
            exitCode,
            signal,
            stdoutRaw,
            stderrRaw,
            stdout: decodeOutput(stdoutRaw, encoding),
            stderr: decodeOutput(stderrRaw, encoding),
            durationMs: Date.now() - started,
          });
        });
      });

      if (opts.timeoutMs && opts.timeoutMs > 0) {
        timer = setTimeout(() => {
          finish(() => {
            void this.kill(child);
            reject(
              new OhjsError('PROC-TIMEOUT', `${cmd.file} timed out after ${opts.timeoutMs} ms`, {
                cmd,
                raw: partial(),
              }),
            );
          });
        }, opts.timeoutMs);
      }
      sub = opts.token?.onCancellationRequested(() => {
        finish(() => {
          void this.kill(child);
          reject(new OhjsError('PROC-CANCELLED', `${cmd.file} cancelled`, { cmd, raw: partial() }));
        });
      });

      if (opts.input !== undefined) child.stdin?.end(opts.input);
      else child.stdin?.end();
    });
  }

  spawnStream(cmd: CommandSpec, opts: Omit<RunOptions, 'input'> = {}): IStreamingProcess {
    const encoding = opts.encoding ?? this.defaults.encoding ?? 'auto';
    const label = encoding === 'gbk' ? 'gbk' : 'utf-8';
    const outDec = new TextDecoder(label);
    const errDec = new TextDecoder(label);
    const outL: Array<(s: string) => void> = [];
    const errL: Array<(s: string) => void> = [];
    let child: ChildProcess | undefined;
    let startError: Error | undefined;
    try {
      child = this.start(cmd);
    } catch (e) {
      startError = e as Error;
    }
    const exited = new Promise<{ exitCode: number | null; signal: string | null; error?: Error }>(
      (resolve) => {
        if (!child) {
          resolve({ exitCode: null, signal: null, error: startError });
          return;
        }
        child.on('error', (e) => resolve({ exitCode: null, signal: null, error: e }));
        child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
      },
    );
    child?.stdout?.on('data', (d: Buffer) => {
      const s = outDec.decode(d, { stream: true });
      for (const l of outL) l(s);
    });
    child?.stderr?.on('data', (d: Buffer) => {
      const s = errDec.decode(d, { stream: true });
      for (const l of errL) l(s);
    });
    child?.stdin?.end();
    let timer: NodeJS.Timeout | undefined;
    const kill = async (): Promise<void> => {
      if (timer) clearTimeout(timer);
      if (child) await this.kill(child);
      await exited;
    };
    if (opts.timeoutMs && opts.timeoutMs > 0) timer = setTimeout(() => void kill(), opts.timeoutMs);
    const sub = opts.token?.onCancellationRequested(() => void kill());
    void exited.then(() => {
      if (timer) clearTimeout(timer);
      sub?.dispose();
    });
    return {
      pid: child?.pid,
      onStdout: (l) => void outL.push(l),
      onStderr: (l) => void errL.push(l),
      exited,
      kill,
    };
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.live].map((c) => this.kill(c)));
  }
}
