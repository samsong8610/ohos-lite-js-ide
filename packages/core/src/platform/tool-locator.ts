/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import { OhjsError } from '../errors';
import { HDC_TOOLCHAIN_OH_VERSIONS, ohVersionDirName, normalizeHdcToolchainOhVersion } from './oh-version';
import type { IPlatform, IProcessRunner } from './types';

export type ToolId = 'hdc' | 'node' | 'hvigorw' | 'jerry-snapshot';
export type ToolSource = 'user' | 'project' | 'path' | 'bundled' | 'default';

export interface ToolHints {
  /** user setting, e.g. ohjs.tools.hdcPath */
  user?: string;
  /** project .ohjs/toolchain.json */
  project?: string;
  /** extension install dir; bundled binaries live in <dir>/bin/<platform-arch>/[<oh-version>/] */
  extensionDir?: string;
  /** OpenHarmony release bucket (5.0.3 / 6.1-LTS) for version-specific bundled & SDK paths */
  ohToolchain?: string;
}

export interface LocatedTool {
  tool: ToolId;
  path: string;
  source: ToolSource;
}

const TOOL_KIND: Record<ToolId, 'exe' | 'script'> = {
  hdc: 'exe',
  node: 'exe',
  hvigorw: 'script',
  'jerry-snapshot': 'exe',
};

const VERSION_PROBE: Record<ToolId, { args: string[]; pattern: RegExp }> = {
  hdc: { args: ['-v'], pattern: /(?:Ver:\s*)?(\d+\.\d+\.\d+[a-z]?)/i },
  node: { args: ['--version'], pattern: /v?(\d+\.\d+\.\d+)/ },
  hvigorw: { args: ['--version'], pattern: /(\d+\.\d+\.\d+)/ },
  'jerry-snapshot': { args: ['--version'], pattern: /(\d+\.\d+\.\d+)/ },
};

export type ExistsFn = (p: string) => boolean;
const defaultExists: ExistsFn = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * IToolLocator (ARCHITECTURE §5.1 / §15.2, NFR-PLT-002, NFR-DST-004):
 * user setting > project config > PATH > VSIX bundled bin/ > default install dirs.
 */
export class ToolLocator {
  constructor(
    private readonly platform: IPlatform,
    private readonly exists: ExistsFn = defaultExists,
  ) {}

  defaultDirs(tool: ToolId, ohToolchain?: string): string[] {
    const p = this.platform;
    const home = p.homeDir();
    const hdcVersioned = (roots: string[]): string[] => {
      const norm = normalizeHdcToolchainOhVersion(ohToolchain ?? '');
      if (!norm) return [];
      const vd = ohVersionDirName(norm);
      return roots.flatMap((r) => [
        p.join(r, vd),
        p.join(r, norm),
        p.join(r, vd.replace(/^v/i, '')),
      ]);
    };
    if (p.kind === 'win32') {
      const local = p.mergeEnv({})['LOCALAPPDATA'] ?? p.join(home, 'AppData', 'Local');
      const sdk = p.join(local, 'Huawei', 'Sdk');
      if (tool === 'hdc')
        return [
          ...hdcVersioned([
            p.join(local, 'OpenHarmony', 'Sdk'),
            p.join(home, 'OpenHarmony', 'Sdk'),
          ]),
          p.join(sdk, 'openharmony', 'toolchains'),
          p.join(sdk, 'default', 'openharmony', 'toolchains'),
        ];
      if (tool === 'hvigorw') return [p.join(local, 'Programs', 'DevEco Studio', 'tools', 'hvigor', 'bin')];
      return [];
    }
    if (tool === 'hdc')
      return [
        ...hdcVersioned([p.join(home, 'OpenHarmony', 'Sdk'), p.join(home, 'Library', 'OpenHarmony', 'Sdk')]),
        p.join(home, 'OpenHarmony', 'Sdk', 'toolchains'),
        p.join(home, 'Library', 'OpenHarmony', 'Sdk', 'toolchains'),
      ];
    if (tool === 'hvigorw') return [p.join(home, 'OpenHarmony', 'hvigor', 'bin')];
    return [];
  }

  candidates(tool: ToolId, hints: ToolHints = {}): Array<{ path: string; source: ToolSource }> {
    const p = this.platform;
    const name = p.exeName(tool, TOOL_KIND[tool]);
    const out: Array<{ path: string; source: ToolSource }> = [];
    const oh = normalizeHdcToolchainOhVersion(hints.ohToolchain);
    if (hints.user) out.push({ path: hints.user, source: 'user' });
    if (hints.project) out.push({ path: hints.project, source: 'project' });
    const names = p.kind === 'win32' && TOOL_KIND[tool] === 'script' ? [name, `${tool}.cmd`] : [name];
    for (const dir of p.pathEntries())
      for (const n of names) out.push({ path: p.join(dir, n), source: 'path' });
    if (hints.extensionDir && tool === 'hdc') {
      const base = p.join(hints.extensionDir, 'bin', p.binKey);
      const versionOrder = oh
        ? [oh]
        : hints.ohToolchain
          ? []
          : [...HDC_TOOLCHAIN_OH_VERSIONS].reverse();
      for (const v of versionOrder)
        out.push({ path: p.join(base, ohVersionDirName(v), name), source: 'bundled' });
      out.push({ path: p.join(base, name), source: 'bundled' });
    } else if (hints.extensionDir) {
      out.push({ path: p.join(hints.extensionDir, 'bin', p.binKey, name), source: 'bundled' });
    }
    for (const dir of this.defaultDirs(tool, hints.ohToolchain)) out.push({ path: p.join(dir, name), source: 'default' });
    return out;
  }

  locate(tool: ToolId, hints: ToolHints = {}): LocatedTool {
    const tried: string[] = [];
    for (const c of this.candidates(tool, hints)) {
      tried.push(c.path);
      if (this.exists(c.path)) return { tool, path: c.path, source: c.source };
      // an explicitly configured path that does not exist is an error, not a fallthrough
      if (c.source === 'user') {
        throw new OhjsError(
          tool === 'hdc' ? 'ENV-HDC-NOT-FOUND' : 'ENV-TOOL-NOT-FOUND',
          `${tool} not found at configured path ${c.path}`,
          { hint: 'Fix the ohjs.tools.* setting or clear it to auto-detect.' },
        );
      }
    }
    throw new OhjsError(tool === 'hdc' ? 'ENV-HDC-NOT-FOUND' : 'ENV-TOOL-NOT-FOUND', `${tool} not found`, {
      raw: tried.join('\n'),
      hint: `Install ${tool} or set ohjs.tools.${tool === 'jerry-snapshot' ? 'jerrySnapshot' : tool}Path.`,
    });
  }

  async probeVersion(
    located: LocatedTool,
    runner: IProcessRunner,
    timeoutMs = 10000,
  ): Promise<string | undefined> {
    const probe = VERSION_PROBE[located.tool];
    const r = await runner.run({ file: located.path, args: probe.args }, { timeoutMs });
    const m = probe.pattern.exec(r.stdout + '\n' + r.stderr);
    return m?.[1];
  }
}
