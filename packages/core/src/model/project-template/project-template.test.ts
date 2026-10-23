/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import {
  listProjectTemplates,
  mapTemplateOutputPath,
  renderProjectTemplate,
  scalePx,
  substituteTemplateText,
  validateBundleName,
} from './index';

const templatesRoot = path.resolve(__dirname, '../../../../../templates');

describe('validateBundleName (FR-PRJ-001)', () => {
  it('accepts three-or-more segment names', () => {
    expect(validateBundleName('com.example.demo').ok).toBe(true);
    expect(validateBundleName('com.my_co.app_v2').ok).toBe(true);
  });
  it('rejects too few segments and invalid characters', () => {
    expect(validateBundleName('com.example').ok).toBe(false);
    expect(validateBundleName('1com.example.app').ok).toBe(false);
    expect(validateBundleName('').ok).toBe(false);
  });
});

describe('substituteTemplateText', () => {
  const ctx = {
    bundleName: 'com.test.app',
    vendor: 'test',
    sdkVersion: '6.1-lts' as const,
    deviceProfileId: '2k0300-1024x768',
    display: { width: 1024, height: 768 },
  };

  it('replaces variables and px scaling', () => {
    expect(substituteTemplateText('{{bundleName}} w{{display.width}}', ctx)).toBe('com.test.app w1024');
    expect(scalePx(512, 1024)).toBe(512);
    expect(substituteTemplateText('width: {{px 512}}px;', ctx)).toBe('width: 512px;');
    expect(
      substituteTemplateText('width: {{px 512}}px;', { ...ctx, display: { width: 512, height: 768 } }),
    ).toBe('width: 256px;');
  });
});

describe('mapTemplateOutputPath', () => {
  it('strips .tmpl and maps gitignore', () => {
    expect(mapTemplateOutputPath('entry/config.json.tmpl')).toBe('entry/config.json');
    expect(mapTemplateOutputPath('gitignore')).toBe('.gitignore');
  });
});

describe('renderProjectTemplate', () => {
  it('lists empty and list-demo templates', () => {
    const ids = listProjectTemplates(templatesRoot).map((t) => t.id);
    expect(ids).toContain('empty');
    expect(ids).toContain('list-demo');
  });

  it('renders empty project with .gitignore and .ohjs/project.json', () => {
    const files = renderProjectTemplate(templatesRoot, 'empty', {
      bundleName: 'com.example.wizard',
      vendor: 'example',
      sdkVersion: '5.0.3',
      deviceProfileId: '2k0300-1024x768',
      display: { width: 1024, height: 768 },
    });
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('.ohjs/project.json');
    expect(paths).toContain('entry/src/main/config.json');
    const config = JSON.parse(
      new TextDecoder().decode(files.find((f) => f.relativePath.endsWith('config.json'))!.content),
    );
    expect(config.app.bundleName).toBe('com.example.wizard');
    expect(config.module.deviceType).toEqual(['smartVision']);
    expect(config.module.js[0].pages[0]).toBe('pages/index/index');
  });
});
