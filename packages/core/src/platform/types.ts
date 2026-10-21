/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CancellationToken } from '../cancellation';

export type PlatformKind = 'win32' | 'darwin' | 'linux';
export type OutputEncoding = 'auto' | 'utf8' | 'gbk';

/** ARCHITECTURE §5.1, NFR-PLT-001. */
export interface IPlatform {
  readonly kind: PlatformKind;
  readonly arch: string;
  /** hdc → hdc.exe on Windows; hvigorw → hvigorw.bat on Windows (kind=script). */
  exeName(base: string, kind?: 'exe' | 'script'): string;
  /** Host path normalisation (drive letter case, separators, long path prefix on Windows). */
  normalize(p: string): string;
  join(...segs: string[]): string;
  dirname(p: string): string;
  isAbsolute(p: string): boolean;
  /** Device paths are always posix. */
  toPosixDevicePath(...segs: string[]): string;
  tempDir(): string;
  homeDir(): string;
  readonly pathDelimiter: string;
  /** PATH entries of the given env (case-insensitive key on Windows). */
  pathEntries(env?: Record<string, string | undefined>): string[];
  /** Merge extra vars into the base env; on Windows keys compare case-insensitively (PATH vs Path). */
  mergeEnv(extra: Record<string, string>, base?: Record<string, string | undefined>): Record<string, string>;
  /** Platform/arch key used for bundled binaries, e.g. win32-x64. */
  readonly binKey: string;
}

export interface CommandSpec {
  file: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface RunOptions {
  /** ms; 0 or undefined = no timeout */
  timeoutMs?: number;
  token?: CancellationToken;
  encoding?: OutputEncoding;
  /** data written to stdin, then stdin is closed */
  input?: string | Uint8Array;
}

export interface ProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Raw bytes are kept so callers can re-decode (GBK on Chinese Windows, ARCHITECTURE §5.1). */
  stdoutRaw: Uint8Array;
  stderrRaw: Uint8Array;
  durationMs: number;
}

export interface IStreamingProcess {
  readonly pid: number | undefined;
  onStdout(listener: (chunk: string) => void): void;
  onStderr(listener: (chunk: string) => void): void;
  /** resolves when the process exits (never rejects; spawn errors resolve with exitCode null + error) */
  readonly exited: Promise<{ exitCode: number | null; signal: string | null; error?: Error }>;
  /** Kills the whole process tree. */
  kill(): Promise<void>;
}

export interface IProcessRunner {
  run(cmd: CommandSpec, opts?: RunOptions): Promise<ProcessResult>;
  spawnStream(cmd: CommandSpec, opts?: Omit<RunOptions, 'input'>): IStreamingProcess;
  /** Kills every child still alive (extension deactivate). */
  disposeAll(): Promise<void>;
}
