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
  it('accepts two-or-more segment names', () => {
    expect(validateBundleName('me.listdemo').ok).toBe(true);
    expect(validateBundleName('com.example.demo').ok).toBe(true);
    expect(validateBundleName('com.my_co.app_v2').ok).toBe(true);
  });
  it('rejects too few segments and invalid characters', () => {
    expect(validateBundleName('listdemo').ok).toBe(false);
    expect(validateBundleName('1com.example.app').ok).toBe(false);
    expect(validateBundleName('').ok).toBe(false);
  });
});

describe('substituteTemplateText', () => {
  const ctx = {
    bundleName: 'com.test.app',
    vendor: 'test',
    sdkVersion: '6.1-lts' as const,
    deviceProfileId: 'cp2a070-la401',
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
      deviceProfileId: 'cp2a070-la401',
      display: { width: 1024, height: 768 },
    });
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('.ohjs/project.json');
    expect(paths).toContain('entry/src/main/config.json');
    expect(paths).toContain('entry/src/main/resources/base/element/string.json');
    expect(paths).toContain('entry/src/main/resources/base/media/icon.png');
    const stringJson = JSON.parse(
      new TextDecoder().decode(
        files.find((f) => f.relativePath === 'entry/src/main/resources/base/element/string.json')!.content,
      ),
    );
    expect(stringJson.string.some((s: { name: string }) => s.name === 'app_name')).toBe(true);
    const config = JSON.parse(
      new TextDecoder().decode(files.find((f) => f.relativePath.endsWith('config.json'))!.content),
    );
    expect(config.app.bundleName).toBe('com.example.wizard');
    expect(config.module.deviceType).toEqual(['smartVision']);
    expect(config.module.js[0].pages[0]).toBe('pages/index/index');
    expect(config.module.abilities[0].icon).toBe('$media:icon');
    expect(config.module.abilities[0].srcPath).toBe('default');
    expect(config.module.abilities[0].visible).toBeUndefined();
    const icon = files.find((f) => f.relativePath.endsWith('resources/base/media/icon.png'))!.content;
    expect(Buffer.from(icon.subarray(0, 4)).toString('hex')).toBe('89504e47');
  });

  it('list-demo shares the launcher icon and app_name string', () => {
    const files = renderProjectTemplate(templatesRoot, 'list-demo', {
      bundleName: 'com.example.list',
      vendor: 'example',
      sdkVersion: '6.1-lts',
      deviceProfileId: 'cp2a070-la401',
      display: { width: 1024, height: 768 },
    });
    expect(files.some((f) => f.relativePath.endsWith('resources/base/media/icon.png'))).toBe(true);
    expect(files.some((f) => f.relativePath.endsWith('resources/base/element/string.json'))).toBe(true);
    const config = JSON.parse(
      new TextDecoder().decode(files.find((f) => f.relativePath.endsWith('config.json'))!.content),
    );
    expect(config.module.abilities[0].icon).toBe('$media:icon');
    expect(config.module.abilities[0].srcPath).toBe('default');
  });
});
