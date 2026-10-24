/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError, type IPlatform, type IProcessRunner } from '@ohjs/core';
import {
  aceLoaderConfigured,
  resolveAceLoaderInstall,
  type AceLoaderDiscoveryOptions,
  type AceLoaderInstall,
} from './ace-loader-config';

/** Pinned upstream ace-loader for gold HAP builds (OpenHarmony 5.0.3). */
export const ACE_LOADER_PROVISION_PIN = {
  repoUrl: 'https://github.com/samsong8610/developtools_ace_js2bundle.git',
  tag: 'OpenHarmony-v5.0.3-Release',
  packageVersion: '1.0.11',
  subdir: 'ace-loader',
} as const;

const META_FILE = '.ohjs-ace-loader-provision.json';

export interface AceLoaderProvisionMeta {
  tag: string;
  packageVersion: string;
  provisionedAt: string;
}

export function aceLoaderProvisionRoot(storageRoot: string): string {
  return path.join(storageRoot, 'ace-loader', ACE_LOADER_PROVISION_PIN.tag);
}

function readToolchain(workspaceRoot: string): { aceLoaderMain?: string; aceLoaderRoot?: string } {
  const tc = path.join(workspaceRoot, '.ohjs', 'toolchain.json');
  if (!fs.existsSync(tc)) return {};
  try {
    return JSON.parse(fs.readFileSync(tc, 'utf8')) as { aceLoaderMain?: string; aceLoaderRoot?: string };
  } catch {
    return {};
  }
}

/** True when the user (or env / toolchain) pointed at ace-loader explicitly — auto-provision must not override. */
export function hasManualAceLoaderSource(opts: AceLoaderDiscoveryOptions): boolean {
  const tc = readToolchain(opts.workspaceRoot);
  const manual = [
    opts.aceLoaderMain,
    process.env.OHJS_ACE_LOADER_MAIN,
    tc.aceLoaderMain,
    tc.aceLoaderRoot,
    opts.aceLoaderPath,
    process.env.OHJS_ACE_LOADER_ROOT,
  ];
  return manual.some((v) => typeof v === 'string' && v.trim().length > 0);
}

export function readProvisionMeta(root: string): AceLoaderProvisionMeta | undefined {
  const metaPath = path.join(root, META_FILE);
  if (!fs.existsSync(metaPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as AceLoaderProvisionMeta;
  } catch {
    return undefined;
  }
}

export function isProvisionedAceLoaderReady(root: string): boolean {
  return aceLoaderConfigured({ workspaceRoot: '/', aceLoaderPath: root });
}

export type AceLoaderProvisionProgress = (message: string) => void;

function findOnPath(platform: IPlatform, base: string, kind: 'exe' | 'script' = 'exe'): string | undefined {
  const names =
    platform.kind === 'win32'
      ? [platform.exeName(base, kind), platform.exeName(base, 'script'), `${base}.cmd`]
      : [platform.exeName(base, kind)];
  for (const dir of platform.pathEntries()) {
    for (const n of names) {
      const full = platform.join(dir, n);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* not on PATH */
      }
    }
  }
  return undefined;
}

function requireOnPath(platform: IPlatform, base: string, kind: 'exe' | 'script' = 'exe'): string {
  const found = findOnPath(platform, base, kind);
  if (!found) {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      `${base} not found on PATH (required for ace-loader auto-provision)`,
      {
        hint: 'Install git and npm, or set ohjs.build.aceLoaderPath / OHJS_ACE_LOADER_ROOT manually.',
      },
    );
  }
  return found;
}

export interface AceLoaderProvisionerDeps {
  cloneSparse?: (
    platform: IPlatform,
    runner: IProcessRunner,
    params: { repoUrl: string; tag: string; subdir: string; destRoot: string },
  ) => Promise<void>;
  npmInstall?: (platform: IPlatform, runner: IProcessRunner, aceRoot: string) => Promise<void>;
}

const FS_RETRY_ATTEMPTS = 8;
const FS_RETRY_DELAY_MS = 250;

type AceLoaderFsOps = Pick<typeof fs, 'existsSync' | 'rmSync' | 'renameSync'>;

let fsOpsOverride: AceLoaderFsOps | undefined;

function fsOps(): AceLoaderFsOps {
  return fsOpsOverride ?? fs;
}

/** Unit tests: simulate transient EPERM on rm/rename without mocking ESM fs. */
export function setAceLoaderFsOpsForTests(ops: AceLoaderFsOps | undefined): void {
  fsOpsOverride = ops;
}

function isRetryableFsError(e: unknown): boolean {
  if (!e || typeof e !== 'object' || !('code' in e)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Remove a path with retries for transient Windows EPERM/EBUSY (AV locks, stale handles). */
export async function rmPathWithRetry(
  target: string,
  opts: { maxAttempts?: number; delayMs?: number } = {},
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? FS_RETRY_ATTEMPTS;
  const delayMs = opts.delayMs ?? FS_RETRY_DELAY_MS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (fsOps().existsSync(target)) {
        fsOps().rmSync(target, { recursive: true, force: true });
      }
      return;
    } catch (e) {
      if (!isRetryableFsError(e) || attempt >= maxAttempts - 1) throw e;
      await sleepMs(delayMs);
    }
  }
}

/** Rename with retries for transient Windows EPERM/EBUSY under AppData. */
export async function renamePathWithRetry(
  from: string,
  to: string,
  opts: { maxAttempts?: number; delayMs?: number } = {},
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? FS_RETRY_ATTEMPTS;
  const delayMs = opts.delayMs ?? FS_RETRY_DELAY_MS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fsOps().renameSync(from, to);
      return;
    } catch (e) {
      if (!isRetryableFsError(e) || attempt >= maxAttempts - 1) throw e;
      await sleepMs(delayMs);
    }
  }
}

/** Git clone staging dir under the OS temp folder (avoids EPERM under VS Code globalStorage on Windows). */
export function aceLoaderCloneStagingDir(platform: IPlatform, tag: string): string {
  const safeTag = tag.replace(/[^\w.-]+/g, '_');
  return path.join(platform.tempDir(), `ohjs-ace-clone-${safeTag}-${process.pid}-${Date.now()}`);
}

async function defaultCloneSparse(
  platform: IPlatform,
  runner: IProcessRunner,
  params: { repoUrl: string; tag: string; subdir: string; destRoot: string },
): Promise<void> {
  const git = requireOnPath(platform, 'git');
  const parent = path.dirname(params.destRoot);
  fs.mkdirSync(parent, { recursive: true });
  const cloneDir = aceLoaderCloneStagingDir(platform, params.tag);
  const legacyCloneTmp = `${params.destRoot}.clone-tmp`;
  await rmPathWithRetry(cloneDir);
  await rmPathWithRetry(legacyCloneTmp);
  await rmPathWithRetry(params.destRoot);

  const clone = await runner.run(
    {
      file: git,
      args: [
        'clone',
        '--depth',
        '1',
        '--branch',
        params.tag,
        '--filter=blob:none',
        '--sparse',
        params.repoUrl,
        cloneDir,
      ],
    },
    { timeoutMs: 600000 },
  );
  if (clone.exitCode !== 0) {
    throw new OhjsError('BLD-TOOL-MISSING', `ace-loader git clone failed: ${clone.stderr || clone.stdout}`, {
      hint: params.repoUrl,
      exitCode: clone.exitCode,
    });
  }

  const sparse = await runner.run(
    { file: git, args: ['sparse-checkout', 'set', params.subdir], cwd: cloneDir },
    { timeoutMs: 120000 },
  );
  if (sparse.exitCode !== 0) {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      `ace-loader sparse-checkout failed: ${sparse.stderr || sparse.stdout}`,
      { exitCode: sparse.exitCode },
    );
  }

  const extracted = path.join(cloneDir, params.subdir);
  if (!fs.existsSync(path.join(extracted, 'webpack.lite.config.js'))) {
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      'ace-loader sparse checkout did not contain webpack.lite.config.js',
      {
        hint: extracted,
      },
    );
  }
  await renamePathWithRetry(extracted, params.destRoot);
  await rmPathWithRetry(cloneDir);
}

/** Unit tests: exercise default sparse clone (git/npm mocked via runner). */
export const defaultCloneSparseForTests = defaultCloneSparse;

async function defaultNpmInstall(
  platform: IPlatform,
  runner: IProcessRunner,
  aceRoot: string,
): Promise<void> {
  const npm = requireOnPath(platform, 'npm', 'script');
  const r = await runner.run(
    { file: npm, args: ['install', '--omit=dev'], cwd: aceRoot },
    { timeoutMs: 900000 },
  );
  if (r.exitCode !== 0) {
    throw new OhjsError('BLD-TOOL-MISSING', `ace-loader npm install failed: ${r.stderr || r.stdout}`, {
      hint: aceRoot,
      exitCode: r.exitCode,
    });
  }
}

let provisionInFlight: Promise<AceLoaderInstall> | undefined;

/**
 * Download pinned ace-loader into {@link storageRoot} and run `npm install --omit=dev` once.
 * Concurrent callers share one in-flight promise.
 */
export function provisionAceLoader(
  platform: IPlatform,
  runner: IProcessRunner,
  storageRoot: string,
  onProgress?: AceLoaderProvisionProgress,
  deps: AceLoaderProvisionerDeps = {},
): Promise<AceLoaderInstall> {
  if (provisionInFlight) return provisionInFlight;

  const run = async (): Promise<AceLoaderInstall> => {
    const root = aceLoaderProvisionRoot(storageRoot);
    if (isProvisionedAceLoaderReady(root)) {
      onProgress?.('ace-loader: using cached install');
      return resolveAceLoaderInstall({ workspaceRoot: '/', aceLoaderPath: root })!;
    }

    onProgress?.(`ace-loader: downloading ${ACE_LOADER_PROVISION_PIN.tag}…`);
    const cloneSparse = deps.cloneSparse ?? defaultCloneSparse;
    const npmInstall = deps.npmInstall ?? defaultNpmInstall;

    await cloneSparse(platform, runner, {
      repoUrl: ACE_LOADER_PROVISION_PIN.repoUrl,
      tag: ACE_LOADER_PROVISION_PIN.tag,
      subdir: ACE_LOADER_PROVISION_PIN.subdir,
      destRoot: root,
    });

    onProgress?.('ace-loader: running npm install --omit=dev…');
    await npmInstall(platform, runner, root);

    const meta: AceLoaderProvisionMeta = {
      tag: ACE_LOADER_PROVISION_PIN.tag,
      packageVersion: ACE_LOADER_PROVISION_PIN.packageVersion,
      provisionedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(root, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);

    const install = resolveAceLoaderInstall({ workspaceRoot: '/', aceLoaderPath: root });
    if (!install) {
      throw new OhjsError(
        'BLD-TOOL-MISSING',
        'ace-loader was provisioned but webpack.lite.config.js or webpack CLI is still missing',
        {
          hint: `Set ohjs.build.aceLoaderPath or OHJS_ACE_LOADER_ROOT to a manual checkout (see README G2).`,
        },
      );
    }
    onProgress?.('ace-loader: ready');
    return install;
  };

  provisionInFlight = run().finally(() => {
    provisionInFlight = undefined;
  });
  return provisionInFlight;
}

/** Reset module-level provision lock (unit tests only). */
export function resetAceLoaderProvisionLockForTests(): void {
  provisionInFlight = undefined;
}

export interface EnsureAceLoaderOptions extends AceLoaderDiscoveryOptions {
  storageRoot?: string;
  provision?: boolean;
  onProgress?: AceLoaderProvisionProgress;
  deps?: AceLoaderProvisionerDeps;
}

/**
 * Resolve ace-loader for build: honor manual paths first, then an existing auto root, optionally provision.
 */
export async function ensureAceLoaderInstall(
  platform: IPlatform,
  runner: IProcessRunner,
  opts: EnsureAceLoaderOptions,
): Promise<AceLoaderInstall | undefined> {
  const autoRoot =
    opts.aceLoaderAutoRoot ?? (opts.storageRoot ? aceLoaderProvisionRoot(opts.storageRoot) : undefined);
  const discovery: AceLoaderDiscoveryOptions = { ...opts, aceLoaderAutoRoot: autoRoot };

  const existing = resolveAceLoaderInstall(discovery);
  if (existing) return existing;

  if (!opts.provision || !opts.storageRoot || hasManualAceLoaderSource(opts)) return undefined;

  try {
    await provisionAceLoader(platform, runner, opts.storageRoot, opts.onProgress, opts.deps);
  } catch (e) {
    if (e instanceof OhjsError) throw e;
    throw new OhjsError(
      'BLD-TOOL-MISSING',
      `ace-loader auto-provision failed: ${(e as Error).message}`,
      { hint: 'Set ohjs.build.aceLoaderPath or OHJS_ACE_LOADER_ROOT (see README G2).' },
      e,
    );
  }
  return resolveAceLoaderInstall(discovery);
}
