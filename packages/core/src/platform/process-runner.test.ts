/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { CancellationTokenSource } from '../cancellation';
import { isOhjsError } from '../errors';
import { HostPlatform, createHostPlatform } from './host-platform';
import { NodeProcessRunner, createTreeKiller, planSpawn } from './process-runner';

const host = createHostPlatform();
const node = process.execPath;
const runner = new NodeProcessRunner(host);
const js = (code: string) => ({ file: node, args: ['-e', code] });

describe('planSpawn', () => {
  const win = new HostPlatform({ kind: 'win32', env: { Path: 'C:\\x' } });
  const lin = new HostPlatform({ kind: 'linux', env: { PATH: '/bin' } });
  it('routes .bat through cmd.exe with verbatim args on win32', () => {
    const p = planSpawn(win, { file: 'C:\\sdk\\hvigorw.bat', args: ['a b'], env: { PATH: 'C:\\y' } });
    expect(p.file).toBe('cmd.exe');
    expect(p.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(p.options.windowsVerbatimArguments).toBe(true);
    expect(p.options.shell).toBeUndefined();
    expect((p.options.env as Record<string, string>)['PATH']).toBe('C:\\y');
  });
  it('spawns .exe directly on win32 without detaching', () => {
    const p = planSpawn(win, { file: 'hdc.exe', args: ['list', 'targets'] });
    expect(p).toMatchObject({ file: 'hdc.exe', args: ['list', 'targets'] });
    expect(p.options.detached).toBeUndefined();
    expect(p.options.env).toBeUndefined();
  });
  it('detaches on posix for process-group kill', () => {
    const p = planSpawn(lin, { file: '/usr/bin/hdc', args: [], cwd: '/tmp' });
    expect(p.options.detached).toBe(true);
    expect(p.options.cwd).toBe('/tmp');
  });
});

describe('NodeProcessRunner.run', () => {
  it('captures stdout, stderr and exit code', async () => {
    const r = await runner.run(js('process.stdout.write("out");process.stderr.write("err");process.exit(3)'));
    expect(r).toMatchObject({ stdout: 'out', stderr: 'err', exitCode: 3 });
    expect(r.stdoutRaw).toBeInstanceOf(Uint8Array);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('writes input to stdin', async () => {
    const r = await runner.run(js('process.stdin.pipe(process.stdout)'), { input: 'hello' });
    expect(r.stdout).toBe('hello');
  });

  it('decodes GBK output in auto mode and keeps raw bytes', async () => {
    const r = await runner.run(js('process.stdout.write(Buffer.from([0xc4,0xe3,0xba,0xc3]))'));
    expect(r.stdout).toBe('你好');
    expect([...r.stdoutRaw]).toEqual([0xc4, 0xe3, 0xba, 0xc3]);
  });

  it('passes env merged with the platform env', async () => {
    const r = await runner.run({
      ...js('process.stdout.write(process.env.OHJS_T||"")'),
      env: { OHJS_T: 'v' },
    });
    expect(r.stdout).toBe('v');
  });

  it('times out and kills the child', async () => {
    const err = await runner
      .run(js('process.stdout.write("partial");setTimeout(()=>{},60000)'), { timeoutMs: 300 })
      .catch((e) => e);
    expect(isOhjsError(err, 'PROC-TIMEOUT')).toBe(true);
    expect(err.detail.raw).toContain('partial');
    await vi.waitFor(() => expect(runner.liveCount).toBe(0), { timeout: 5000 });
  });

  it('cancels via token', async () => {
    const cts = new CancellationTokenSource();
    const p = runner.run(js('setTimeout(()=>{},60000)'), { token: cts.token });
    setTimeout(() => cts.cancel(), 100);
    const err = await p.catch((e) => e);
    expect(isOhjsError(err, 'PROC-CANCELLED')).toBe(true);
  });

  it('rejects immediately when already cancelled', async () => {
    const cts = new CancellationTokenSource();
    cts.cancel();
    const err = await runner.run(js(''), { token: cts.token }).catch((e) => e);
    expect(isOhjsError(err, 'PROC-CANCELLED')).toBe(true);
  });

  it('maps ENOENT to ENV-TOOL-NOT-FOUND', async () => {
    const err = await runner.run({ file: '/definitely/not/here/hdc', args: [] }).catch((e) => e);
    expect(isOhjsError(err, 'ENV-TOOL-NOT-FOUND')).toBe(true);
  });

  it('maps synchronous spawn failures to PROC-SPAWN-FAILED', async () => {
    const err = await runner.run({ file: node, args: [], cwd: 'bad\0cwd' }).catch((e) => e);
    expect(isOhjsError(err, 'PROC-SPAWN-FAILED')).toBe(true);
  });

  it('uses the configured default encoding', async () => {
    const r = new NodeProcessRunner(host, { encoding: 'gbk' });
    const res = await r.run(js('process.stdout.write(Buffer.from([0xc4,0xe3]))'));
    expect(res.stdout).toBe('你');
  });
});

describe('NodeProcessRunner.spawnStream', () => {
  it('streams output and resolves exit', async () => {
    const s = runner.spawnStream(js('console.log("a");console.error("b");process.exit(2)'));
    const out: string[] = [];
    const err: string[] = [];
    s.onStdout((c) => out.push(c));
    s.onStderr((c) => err.push(c));
    const ex = await s.exited;
    expect(ex.exitCode).toBe(2);
    expect(out.join('')).toContain('a');
    expect(err.join('')).toContain('b');
    expect(s.pid).toBeTypeOf('number');
  });

  it('kills long-running streams (tree kill)', async () => {
    const s = runner.spawnStream(js('setInterval(()=>console.log("tick"),50)'));
    await new Promise<void>((r) => s.onStdout(() => r()));
    await s.kill();
    const ex = await s.exited;
    // The script never exits on its own, so `exited` resolving means it was terminated.
    // POSIX: killed by a signal (exitCode null); Windows: taskkill /T /F yields a numeric non-zero code, signal null.
    expect(ex.error).toBeUndefined();
    expect(ex.signal !== null || (ex.exitCode !== null && ex.exitCode !== 0)).toBe(true);
  });

  it('honours timeout and cancellation', async () => {
    const s1 = runner.spawnStream(js('setInterval(()=>{},50)'), { timeoutMs: 200 });
    expect((await s1.exited).signal ?? 'killed').toBeTruthy();
    const cts = new CancellationTokenSource();
    const s2 = runner.spawnStream(js('setInterval(()=>{},50)'), { token: cts.token, encoding: 'gbk' });
    cts.cancel();
    await s2.exited;
  });

  it('reports spawn errors through exited', async () => {
    const s = runner.spawnStream({ file: '/no/such/binary', args: [] });
    const ex = await s.exited;
    expect(ex.error).toBeDefined();
    const s2 = runner.spawnStream({ file: node, args: [], cwd: 'bad\0cwd' });
    expect((await s2.exited).error).toBeDefined();
    await s2.kill();
  });

  it('disposeAll kills every live child', async () => {
    const r = new NodeProcessRunner(host);
    const a = r.spawnStream(js('setInterval(()=>{},50)'));
    const b = r.spawnStream(js('setInterval(()=>{},50)'));
    await new Promise((res) => setTimeout(res, 150));
    await r.disposeAll();
    await Promise.all([a.exited, b.exited]);
    expect(r.liveCount).toBe(0);
  });
});

describe('createTreeKiller', () => {
  it('posix killer tolerates dead pids', async () => {
    const k = createTreeKiller(new HostPlatform({ kind: 'linux' }));
    await expect(k(2 ** 22 + 12345)).resolves.toBeUndefined();
  });
  it('win32 killer resolves even when taskkill is missing', async () => {
    const k = createTreeKiller(new HostPlatform({ kind: 'win32' }));
    await expect(k(2 ** 22 + 12345)).resolves.toBeUndefined();
  });
  it.runIf(host.kind !== 'win32')('kills grandchildren via the process group', async () => {
    const code =
      'const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},50)"],{stdio:"ignore"});' +
      'console.log(c.pid);setInterval(()=>{},50)';
    const s = runner.spawnStream(js(code));
    const pid = await new Promise<number>((r) => s.onStdout((c) => r(Number(c.trim()))));
    await s.kill();
    await vi.waitFor(
      () => {
        expect(() => process.kill(pid, 0)).toThrow();
      },
      { timeout: 5000 },
    );
  });
});
