/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path';
import * as os from 'os';
import type { IPlatform, PlatformKind } from './types';

export interface PlatformOptions {
  kind: PlatformKind;
  arch?: string;
  env?: Record<string, string | undefined>;
  homeDir?: string;
  tempDir?: string;
}

/** Single implementation parameterised by kind so Windows behaviour is testable on Linux CI (§5.1.1). */
export class HostPlatform implements IPlatform {
  readonly kind: PlatformKind;
  readonly arch: string;
  private readonly p: path.PlatformPath;
  private readonly env: Record<string, string | undefined>;
  private readonly home: string;
  private readonly tmp: string;

  constructor(opts: PlatformOptions) {
    this.kind = opts.kind;
    this.arch = opts.arch ?? 'x64';
    this.p = opts.kind === 'win32' ? path.win32 : path.posix;
    this.env = opts.env ?? {};
    this.home = opts.homeDir ?? (opts.kind === 'win32' ? 'C:\\Users\\user' : '/home/user');
    this.tmp = opts.tempDir ?? (opts.kind === 'win32' ? 'C:\\Windows\\Temp' : '/tmp');
  }

  get pathDelimiter(): string {
    return this.p.delimiter;
  }

  get binKey(): string {
    return `${this.kind}-${this.arch}`;
  }

  exeName(base: string, kind: 'exe' | 'script' = 'exe'): string {
    if (this.kind !== 'win32') return base;
    if (/\.(exe|bat|cmd)$/i.test(base)) return base;
    return base + (kind === 'script' ? '.bat' : '.exe');
  }

  normalize(input: string): string {
    if (this.kind !== 'win32') return this.p.normalize(input);
    let s = input.replace(/\//g, '\\');
    const hadLongPrefix = s.startsWith('\\\\?\\');
    if (hadLongPrefix) s = s.slice(4);
    s = this.p.normalize(s);
    s = s.replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`);
    if (s.length > 1 && s.endsWith('\\') && !/^[A-Z]:\\$/.test(s)) s = s.slice(0, -1);
    // re-apply long path prefix when needed (MAX_PATH = 260)
    if ((hadLongPrefix || s.length >= 260) && /^[A-Z]:\\/.test(s)) s = '\\\\?\\' + s;
    return s;
  }

  join(...segs: string[]): string {
    return this.p.join(...segs);
  }

  dirname(p: string): string {
    return this.p.dirname(p);
  }

  isAbsolute(p: string): boolean {
    return this.p.isAbsolute(p);
  }

  toPosixDevicePath(...segs: string[]): string {
    const joined = path.posix.join(...segs.map((s) => s.replace(/\\/g, '/')));
    return joined.startsWith('/') ? joined : '/' + joined;
  }

  tempDir(): string {
    return this.tmp;
  }

  homeDir(): string {
    return this.home;
  }

  private findKey(env: Record<string, string | undefined>, key: string): string | undefined {
    if (this.kind !== 'win32') return key in env ? key : undefined;
    const lower = key.toLowerCase();
    return Object.keys(env).find((k) => k.toLowerCase() === lower);
  }

  pathEntries(env: Record<string, string | undefined> = this.env): string[] {
    const k = this.findKey(env, 'PATH');
    const v = k ? env[k] : undefined;
    return (v ?? '').split(this.p.delimiter).filter((e) => e.length > 0);
  }

  mergeEnv(
    extra: Record<string, string>,
    base: Record<string, string | undefined> = this.env,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) if (v !== undefined) out[k] = v;
    for (const [k, v] of Object.entries(extra)) {
      const existing = this.findKey(out, k);
      if (existing !== undefined && existing !== k) delete out[existing];
      out[k] = v;
    }
    return out;
  }
}

/** The only place that inspects the real host OS. */
export function createHostPlatform(): IPlatform {
  const kind: PlatformKind =
    process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  return new HostPlatform({
    kind,
    arch: process.arch,
    env: process.env,
    homeDir: os.homedir(),
    tempDir: os.tmpdir(),
  });
}
