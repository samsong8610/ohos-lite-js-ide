/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEOUTS, type DeviceProfile } from '@ohjs/core';
import { runProjectWizardWithChoices, type ProjectWizardUi } from './wizard';

const templatesRoot = path.resolve(__dirname, '../../../../templates');

const stubProfile: DeviceProfile = {
  id: 'cp2a070-la401',
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
  timeouts: DEFAULT_TIMEOUTS,
  lineage: [],
};

function mockUi(overrides: Partial<ProjectWizardUi> = {}): ProjectWizardUi {
  return {
    pickTemplate: async () => undefined,
    pickSdkVersion: async () => undefined,
    pickDeviceTarget: async (_profiles, base) => ({ kind: 'profile', profile: base }),
    inputDisplaySize: async (initial) => initial,
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
    expect(errors.some((e) => e.includes('two segments'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('custom display size writes a project profile and rescales px', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-wiz-ui-'));
    const other: DeviceProfile = { ...stubProfile, id: 'cp2a101-la401', name: 'Other profile' };
    const ui = mockUi({
      pickDeviceTarget: async (_profiles, base) => ({ kind: 'custom', profile: base }),
      inputDisplaySize: async () => ({ width: 800, height: 480 }),
    });
    const out = await runProjectWizardWithChoices(
      {
        templatesRoot,
        deviceProfiles: [stubProfile, other],
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
        profiles: [stubProfile, other],
        targetRoot: root,
      },
    );
    expect(out).toBe(root);
    const project = JSON.parse(fs.readFileSync(path.join(root, '.ohjs/project.json'), 'utf8'));
    expect(project.defaultDeviceProfile).toBe('custom');
    expect(project.deviceProfiles).toEqual(['custom']);
    const custom = JSON.parse(fs.readFileSync(path.join(root, '.ohjs/device-profiles/custom.json'), 'utf8'));
    expect(custom).toEqual({
      id: 'custom',
      extends: 'cp2a070-la401',
      name: 'Custom 800×480',
      display: { width: 800, height: 480 },
    });
    const css = fs.readFileSync(path.join(root, 'entry/src/main/js/default/pages/index/index.css'), 'utf8');
    expect(css).toContain('font-size: 50px;');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
