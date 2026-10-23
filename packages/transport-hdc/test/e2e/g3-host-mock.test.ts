/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * G3 host gate: fixture build → mock-hdc TCP tconn → deploy / install / start → hilog parse.
 * Invoked by `pnpm run smoke:g3-mock` (no real board, no USB).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DeviceProfileRegistry, NodeProcessRunner, createHostPlatform } from '@ohjs/core';
import { buildProject, findConfigJson, parseFaConfigJson } from '@ohjs/build';
import { createMockHdc } from '@ohjs/test-kit';
import { HdcTransport, LiteDeployService, formatHilogEntry, parseHilogLine } from '@ohjs/transport-hdc';
import { afterEach, describe, expect, it } from 'vitest';

const TCONN = process.env.G3_MOCK_TCONN ?? '127.0.0.1:8710';
const HILOG_LINE =
  process.env.G3_MOCK_HILOG_LINE ?? '10-23 12:00:00.001 42 99 I A0/ACE: G3 host smoke ok';

const fixtureRoot =
  process.env.OHJS_FIXTURE_ROOT ??
  path.join(__dirname, '../../../extension/test/fixtures/oh-project');

function loadProfile() {
  const registry = new DeviceProfileRegistry();
  const json = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../../extension/device-profiles/2k0300-linux-1024x768.json'),
      'utf8',
    ),
  );
  registry.add(json, 'builtin');
  return registry.resolve(json.id);
}

describe('G3 host smoke (mock-hdc)', () => {
  let mock: ReturnType<typeof createMockHdc>;
  let runner: NodeProcessRunner;
  const outDirs: string[] = [];

  afterEach(() => {
    mock?.dispose();
    runner?.disposeAll();
    for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true });
    outDirs.length = 0;
  });

  it('build → tconn → deploy / install / start → log capture parse', async () => {
    mock = createMockHdc({
      version: '3.2.0c',
      reachable: [TCONN],
      hilogcatLine: HILOG_LINE,
    });
    const platform = createHostPlatform();
    runner = new NodeProcessRunner(platform);
    const transport = new HdcTransport({
      hdcPath: mock.hdcPath,
      runner,
      env: mock.env,
    });

    const cfg = findConfigJson(fixtureRoot);
    expect(cfg).toBeTruthy();
    const module = parseFaConfigJson(fs.readFileSync(cfg!, 'utf8'), cfg!);

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-g3-bld-'));
    outDirs.push(outDir);
    const build = await buildProject(platform, runner, {
      workspaceRoot: fixtureRoot,
      outDir,
      backend: 'fixture',
    });
    expect(build.backend).toBe('fixture');
    expect(fs.existsSync(build.hapPath)).toBe(true);

    await transport.connect(TCONN);
    const targets = await transport.listTargets();
    expect(targets.some((t) => t.key === TCONN && t.state === 'Connected')).toBe(true);

    const profile = loadProfile();
    const deploy = new LiteDeployService({ transport, profile });

    const pre = await deploy.preflightDebugFirmware(TCONN);
    expect(pre.firmware).toBe('debug');

    const { remotePath } = await deploy.deployHap(TCONN, build.hapPath);
    expect(remotePath).toBe('/tmp/ohjs/app.hap');
    expect(fs.existsSync(mock.devicePath(TCONN, remotePath))).toBe(true);

    await deploy.install(TCONN, remotePath);
    await deploy.startApp(TCONN, { bundle: module.bundleName, ability: module.abilityName });

    const { output: logOut } = await transport.shell(TCONN, 'hilogcat');
    const rawLine = logOut.trim().split(/\r?\n/).find((l) => l.includes('ACE')) ?? '';
    const parsed = parseHilogLine(rawLine);
    expect(parsed).toMatchObject({ tag: 'ACE', message: 'G3 host smoke ok' });
    expect(formatHilogEntry(parsed)).toBe(HILOG_LINE);

    const joined = mock.calls().map((a) => a.join(' ')).join('\n');
    expect(joined).toMatch(/file send/);
    expect(joined).toMatch(/bm install/);
    expect(joined).toMatch(/aa start/);
  });
});
