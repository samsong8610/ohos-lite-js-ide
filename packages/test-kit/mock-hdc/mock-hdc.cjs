#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';
/**
 * mock-hdc: executable stand-in for the OpenHarmony `hdc` host client (ARCHITECTURE §14.2, NFR-TST-003).
 *
 * Environment:
 *   MOCK_HDC_STATE     directory holding state.json and the virtual device file system (fs/<key>/...)
 *   MOCK_HDC_SCENARIO  optional JSON scenario file (see README.md)
 *
 * Output strings follow developtools_hdc sources (host/server.cpp, common/file.cpp, common/forward.cpp).
 * The plain JS keeps it runnable without a build step; it is not part of any shipped package.
 */
const fs = require('fs');
const path = require('path');

const stateDir = process.env.MOCK_HDC_STATE || path.join(require('os').tmpdir(), 'mock-hdc');
const scenarioFile = process.env.MOCK_HDC_SCENARIO;
const scenario = scenarioFile ? JSON.parse(fs.readFileSync(scenarioFile, 'utf8')) : {};
const stateFile = path.join(stateDir, 'state.json');

function loadState() {
  if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const targets = (scenario.targets || []).map((t) => ({
    connType: 'USB',
    state: 'Connected',
    name: '',
    ...t,
  }));
  return { targets, fports: [], calls: [] };
}
const state = loadState();
function save() {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

let out = '';
const echo = (s) => (out += s.endsWith('\n') ? s : s + '\r\n');
const fail = (s) => echo('[Fail]' + s);
function finish(code) {
  save();
  const enc = scenario.outputEncoding;
  if (enc === 'gbk-hex') process.stdout.write(Buffer.from(out, 'hex'));
  else process.stdout.write(out);
  process.exitCode = code || 0;
}

const argv = process.argv.slice(2);
state.calls.push(argv);
const faults = scenario.faults || {};

// global options
let target;
while (argv.length) {
  if (argv[0] === '-t') {
    argv.shift();
    target = argv.shift();
  } else if (argv[0] === '-s' || argv[0] === '-l') {
    argv.shift();
    argv.shift();
  } else break;
}
const sub = argv[0] || '';

if ((faults.hang || []).includes(sub)) {
  // never answers: exercises caller timeouts / cancellation
  setInterval(() => {}, 1000);
  return;
}
if (faults.serverDown) {
  fail('Connect server failed');
  return finish(0);
}
if (faults.raw && faults.raw[sub] !== undefined) {
  echo(faults.raw[sub]);
  return finish(0);
}

function connected() {
  return state.targets.filter((t) => t.state === 'Connected');
}
function pickTarget() {
  const list = connected();
  if (target) {
    const t = state.targets.find((x) => x.key === target);
    if (!t) return (fail('Not match target founded, check connect-key please'), undefined);
    if (t.state === 'Unauthorized') return (fail('Device Unauthorized'), undefined);
    if (t.state !== 'Connected') return (fail('Device is offline'), undefined);
    return t;
  }
  if (list.length === 0) return (fail('No any connected target'), undefined);
  if (list.length > 1) return (fail('Not match target founded, check connect-key please'), undefined);
  return list[0];
}
function devPath(t, p) {
  const root = path.join(stateDir, 'fs', t.key.replace(/[^A-Za-z0-9._-]/g, '_'));
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, path.posix.normalize('/' + p).slice(1));
}

const handlers = {
  '-v': () => echo('Ver: ' + (scenario.version || '3.1.0e')),
  version: () => handlers['-v'](),
  list: () => {
    if (argv[1] !== 'targets') return fail('Unknown command...');
    const verbose = argv.includes('-v');
    const shown = verbose ? state.targets : connected();
    if (shown.length === 0) return echo('[Empty]');
    for (const t of shown) {
      if (verbose) echo(`${t.key}\t\t${t.connType}\t${t.state}\t${t.name || 'unknown...'}`);
      else echo(t.key + (t.state === 'Unauthorized' ? '\tUnauthorized' : ''));
    }
  },
  tconn: () => {
    const ep = argv[1] || '';
    const reachable = scenario.reachable || [];
    if (!reachable.includes(ep)) return fail('Connect failed');
    const existing = state.targets.find((t) => t.key === ep);
    if (existing) existing.state = 'Connected';
    else
      state.targets.push({
        key: ep,
        connType: 'TCP',
        state: 'Connected',
        name: scenario.tcpDeviceName || '',
      });
    echo('Connect OK');
  },
  shell: () => {
    const t = pickTarget();
    if (!t) return;
    const cmdline = argv.slice(1).join(' ');
    runShell(t, cmdline);
  },
  file: () => {
    const t = pickTarget();
    if (!t) return;
    const [, verb, a, b] = argv;
    if (!a || !b) return fail('There is no local and remote path');
    const start = Date.now();
    if (verb === 'send') {
      if (!fs.existsSync(a)) return fail(`Error opening file: no such file or directory, path:${a}`);
      const dst = devPath(t, b);
      if (!fs.existsSync(path.dirname(dst)))
        return fail(`Error opening file: no such file or directory, path:${b}`);
      fs.copyFileSync(a, dst);
      return okTransfer(fs.statSync(a).size, start);
    }
    if (verb === 'recv') {
      const src = devPath(t, a);
      if (!fs.existsSync(src)) {
        return fail(
          `[E005102] Remote path: ${a} is invalid, no such file/directory or it's out of permission`,
        );
      }
      fs.copyFileSync(src, b);
      return okTransfer(fs.statSync(src).size, start);
    }
    fail('Unknown file option: ' + verb);
  },
  fport: () => {
    if (argv[1] === 'ls') {
      if (state.fports.length === 0) return echo('[Empty]');
      for (const f of state.fports) echo(`${f.key}    ${f.local} ${f.remote}    [Forward]`);
      return;
    }
    if (argv[1] === 'rm') {
      const rule = argv.slice(2).join(' ');
      const i = state.fports.findIndex((f) => `${f.local} ${f.remote}` === rule);
      if (i < 0) return fail(`Remove forward ruler failed, ruler is not exist ${rule}`);
      state.fports.splice(i, 1);
      return echo(`Remove forward ruler success, ruler:${rule}`);
    }
    const t = pickTarget();
    if (!t) return;
    const [, local, remote] = argv;
    if (!/^tcp:\d+$/.test(local || '') || !/^tcp:\d+$/.test(remote || ''))
      return fail('Forward parament failed');
    if (state.fports.some((f) => f.local === local) || (faults.busyPorts || []).includes(local)) {
      return fail('Forwardport result:Failed');
    }
    state.fports.push({ key: t.key, local, remote });
    echo('Forwardport result:OK');
  },
  kill: () => echo('Kill server finish'),
};

function okTransfer(size, start) {
  const ms = Math.max(1, Date.now() - start);
  echo(`FileTransfer finish, Size:${size}, File count = 1, time:${ms}ms rate:${(size / ms).toFixed(2)}kB/s`);
}

/** Minimal device shell: scenario rules first, then a few builtins; supports `;` chains and $?. */
function runShell(t, cmdline) {
  let rc = 0;
  const segments = cmdline.split(';').flatMap((s) => s.split('&&'));
  for (const raw of segments) {
    const jobs = raw
      .trim()
      .split('&')
      .map((j) => j.trim());
    for (let i = 0; i < jobs.length; i++) {
      const c = jobs[i].replace(/\$\?/g, String(rc)).replace(/\$!/g, String(scenario.lastBgPid || '0'));
      if (!c) continue;
      rc = runOne(t, c);
    }
  }
}
function unquote(s) {
  return s.replace(/^'(.*)'$/, '$1').replace(/'\\''/g, "'");
}
function runOne(t, c) {
  const echoRedirect = /^echo\s+(\S+)\s*>\s*(\S+)\s*$/.exec(c);
  if (echoRedirect) {
    const [, val, dst] = echoRedirect;
    fs.mkdirSync(path.dirname(devPath(t, dst)), { recursive: true });
    fs.writeFileSync(devPath(t, dst), val + '\n');
    return 0;
  }
  const bg = tryBackgroundRedirect(t, c);
  if (bg != null) return 0;
  for (const rule of scenario.shell || []) {
    if (new RegExp(rule.match).test(c)) {
      if (rule.stdout) echo(rule.stdout);
      return rule.exitCode || 0;
    }
  }
  const [cmd, ...rest] = c.match(/'(?:[^']|'\\'')*'|\S+/g) || [];
  const args = rest.map(unquote);
  const flags = args.filter((a) => a.startsWith('-'));
  const paths = args.filter((a) => !a.startsWith('-'));
  switch (cmd) {
    case 'echo':
      if (args.length === 1 && /^\d+$/.test(args[0]) && scenario.lastBgPid) {
        const dst = paths[0];
        if (dst) {
          fs.mkdirSync(path.dirname(devPath(t, dst)), { recursive: true });
          fs.writeFileSync(devPath(t, dst), scenario.lastBgPid + '\n');
          scenario.lastBgPid = undefined;
        }
      }
      echo(args.join(' '));
      return 0;
    case 'mkdir':
      for (const p of paths) fs.mkdirSync(devPath(t, p), { recursive: flags.includes('-p') });
      return 0;
    case 'touch':
      for (const p of paths) fs.writeFileSync(devPath(t, p), '');
      return 0;
    case 'rm':
      for (const p of paths) {
        if (!fs.existsSync(devPath(t, p))) {
          if (!flags.includes('-f')) return (echo(`rm: ${p}: No such file or directory`), 1);
        } else fs.rmSync(devPath(t, p), { recursive: flags.some((f) => f.includes('r')), force: true });
      }
      return 0;
    case 'ls':
      for (const p of paths) {
        if (!fs.existsSync(devPath(t, p))) return (echo(`ls: ${p}: No such file or directory`), 1);
        echo(p);
      }
      return 0;
    case 'cat':
      for (const p of paths) {
        if (!fs.existsSync(devPath(t, p))) return (echo(`cat: ${p}: No such file or directory`), 1);
        echo(fs.readFileSync(devPath(t, p), 'utf8'));
      }
      return 0;
    case 'kill': {
      const pid = paths[0];
      if (scenario.killedPids) scenario.killedPids.push(pid);
      return 0;
    }
    case 'hilogcat': {
      const out = scenario.hilogcatLine || '10-23 00:00:00.000 1 1 I A0/ACE: mock-hilogcat';
      echo(out);
      return 0;
    }
    case 'bm':
      return runBm(t, args);
    case 'aa':
      return runAa(t, args);
    default:
      echo(`sh: ${cmd}: not found`);
      return 127;
  }
}

function runBm(t, args) {
  const sub = args[0];
  if (sub === 'set' && args.includes('disable')) {
    const msg = scenario.bmSetDisable ?? 'success';
    echo(msg);
    return 0;
  }
  if (sub === 'install') {
    const i = args.indexOf('-p');
    const hap = i >= 0 ? args[i + 1] : '';
    if (!hap || !fs.existsSync(devPath(t, hap))) {
      echo('resultMessage is ERR_NO_FILE');
      return 0;
    }
    echo('resultMessage is install success !');
    return 0;
  }
  if (sub === 'uninstall') {
    echo('resultMessage is uninstall success !');
    return 0;
  }
  echo('usage: bm …');
  return 0;
}

function runAa(_t, args) {
  const sub = args[0];
  if (sub === 'start') {
    if (scenario.aaStartFail) {
      echo('Failed to run the command.');
      return 0;
    }
    echo('start ability success');
    return 0;
  }
  if (sub === 'terminate') {
    echo('terminate ability success');
    return 0;
  }
  echo('usage: aa …');
  return 0;
}

/** Handles `cmd > file &` background redirects used by hilog capture. */
function tryBackgroundRedirect(t, c) {
  const m = /^(.+?)\s*>\s*(\S+)\s*&\s*$/.exec(c);
  if (!m) return null;
  const inner = m[1].trim();
  const outFile = m[2];
  const pid = String(9000 + (scenario.nextPid = (scenario.nextPid || 9000) + 1));
  if (inner.startsWith('hilogcat')) {
    const line = scenario.hilogcatLine || '10-23 00:00:00.000 1 1 I A0/ACE: mock-hilogcat';
    fs.mkdirSync(path.dirname(devPath(t, outFile)), { recursive: true });
    fs.writeFileSync(devPath(t, outFile), line + '\n');
  } else {
    fs.mkdirSync(path.dirname(devPath(t, outFile)), { recursive: true });
    fs.writeFileSync(devPath(t, outFile), '');
  }
  scenario.lastBgPid = pid;
  return pid;
}

const h = handlers[sub];
if (!h) fail('[E001001]Unknown command');
else h();
finish(0);
