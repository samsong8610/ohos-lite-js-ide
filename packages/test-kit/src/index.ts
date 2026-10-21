/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface MockTarget {
  key: string;
  connType?: 'USB' | 'TCP' | 'UART' | 'BT' | 'UNKNOWN';
  state?: 'Connected' | 'Ready' | 'Offline' | 'Unauthorized' | 'Unknown';
  name?: string;
}

export interface MockHdcScenario {
  version?: string;
  targets?: MockTarget[];
  /** endpoints accepted by `tconn` */
  reachable?: string[];
  tcpDeviceName?: string;
  /** device shell rules, checked before the builtin commands (bm / aa / hilogcat …) */
  shell?: Array<{ match: string; stdout?: string; exitCode?: number }>;
  /** 'gbk-hex': raw.<sub> values are hex-encoded bytes written verbatim */
  outputEncoding?: 'gbk-hex';
  faults?: {
    /** sub-commands that never answer (timeout / cancellation tests) */
    hang?: string[];
    serverDown?: boolean;
    /** fixed output per sub-command */
    raw?: Record<string, string>;
    busyPorts?: string[];
  };
}

export interface MockHdc {
  /** path of the executable to configure as hdcPath (hdc or hdc.cmd) */
  hdcPath: string;
  env: Record<string, string>;
  stateDir: string;
  /** host path of a device file in the virtual file system */
  devicePath(key: string, remote: string): string;
  /** argv of every call so far */
  calls(): string[][];
  dispose(): void;
}

export const MOCK_HDC_DIR = path.resolve(__dirname, '..', 'mock-hdc');

/** Creates an isolated mock-hdc instance (own state dir + scenario). */
export function createMockHdc(scenario: MockHdcScenario = {}, isWindows = path.sep === '\\'): MockHdc {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-hdc-'));
  const scenarioFile = path.join(stateDir, 'scenario.json');
  fs.writeFileSync(scenarioFile, JSON.stringify(scenario));
  const hdcPath = path.join(MOCK_HDC_DIR, 'bin', isWindows ? 'hdc.cmd' : 'hdc');
  return {
    hdcPath,
    env: { MOCK_HDC_STATE: stateDir, MOCK_HDC_SCENARIO: scenarioFile },
    stateDir,
    devicePath: (key, remote) =>
      path.join(
        stateDir,
        'fs',
        key.replace(/[^A-Za-z0-9._-]/g, '_'),
        path.posix.normalize('/' + remote).slice(1),
      ),
    calls: () => {
      const f = path.join(stateDir, 'state.json');
      return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as { calls: string[][] }).calls : [];
    },
    dispose: () => fs.rmSync(stateDir, { recursive: true, force: true }),
  };
}
