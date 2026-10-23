/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { DeviceProfile } from '@ohjs/core';
import { runProjectWizardWithChoices, type ProjectWizardUi } from './wizard';

const templatesRoot = path.resolve(__dirname, '../../../../templates');

const stubProfile: DeviceProfile = {
  id: '2k0300-1024x768',
  name: 'Test profile',
  description: '',
  arch: 'loongarch64',
  kernel: 'linux',
  deviceType: 'smartVision',
  display: { width: 1024, height: 768, shape: 'rect', dpi: null },
  features: {},
  connection: { preferred: 'tcp', fallback: [], tcpPort: 8710 },
  paths: {
    tmpDir: '/tmp',
    snapshotFlag: '/data/x',
    appInstallRoot: '/storage',
    firmwareManifest: '/etc/x',
  },
  commands: {
    install: '',
    uninstall: '',
    list: '',
    start: '',
    stop: '',
    log: '',
    disableSignCheck: '',
    setSnapshotMode: '',
    setJsMode: '',
    checkMode: '',
    mkTmp: '',
  },
  debug: {
    port: 5001,
    enableMethod: 'flagFile',
    enableFlag: '/data/x',
    requireDebugFirmware: true,
  },
  jerry: {},
  timeouts: {
    shellMs: 1,
    fileSendMinMs: 1,
    fileSendBytesPerSec: 1,
    deployMs: 1,
    logStartMs: 1,
  },
  lineage: [],
};

function mockUi(overrides: Partial<ProjectWizardUi> = {}): ProjectWizardUi {
  return {
    pickTemplate: async () => undefined,
    pickSdkVersion: async () => undefined,
    pickDeviceProfile: async () => stubProfile,
    inputBundleName: async () => 'com.example.mock',
    inputVendor: async () => 'example',
    pickTargetDirectory: async () => undefined,
    showError: () => undefined,
    showInfo: () => undefined,
    ...overrides,
  };
}

describe('runProjectWizardWithChoices', () => {
  it('writes scaffold files to an empty directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-wiz-ui-'));
    const ui = mockUi();
    const out = await runProjectWizardWithChoices(
      {
        templatesRoot,
        deviceProfiles: [stubProfile],
        ui,
        isNonEmptyDirectory: async () => false,
        writeProject: async (target, files) => {
          for (const f of files) {
            const dest = path.join(target, f.relativePath);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, f.content);
          }
        },
      },
      {
        templateId: 'empty',
        sdkVersion: '5.0.3',
        profiles: [stubProfile],
        targetRoot: root,
      },
    );
    expect(out).toBe(root);
    expect(fs.existsSync(path.join(root, 'entry/src/main/config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.ohjs/project.json'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('re-prompts when bundle name is invalid', async () => {
    let bundleCalls = 0;
    const ui = mockUi({
      inputBundleName: async () => {
        bundleCalls += 1;
        return bundleCalls === 1 ? 'bad' : 'com.example.valid.app';
      },
    });
    const errors: string[] = [];
    ui.showError = (m) => errors.push(m);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-wiz-ui-'));
    await runProjectWizardWithChoices(
      {
        templatesRoot,
        deviceProfiles: [stubProfile],
        ui,
        isNonEmptyDirectory: async () => false,
        writeProject: async () => undefined,
      },
      {
        templateId: 'empty',
        sdkVersion: '6.1-lts',
        profiles: [stubProfile],
        targetRoot: root,
      },
    );
    expect(bundleCalls).toBe(2);
    expect(errors.some((e) => e.includes('three segments'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
