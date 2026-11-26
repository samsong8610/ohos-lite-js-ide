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

  it('reserves the page-head and separator in display.contentHeight', () => {
    // 768 - 48 (head) - 1 (separator)
    expect(substituteTemplateText('h {{display.contentHeight}}', ctx)).toBe('h 719');
    expect(
      substituteTemplateText('h {{display.contentHeight}}', {
        ...ctx,
        display: { width: 1024, height: 600 },
      }),
    ).toBe('h 551');
    // 480 - round(48 * 800 / 1024) - 1
    expect(
      substituteTemplateText('h {{display.contentHeight}}', {
        ...ctx,
        display: { width: 800, height: 480 },
      }),
    ).toBe('h 441');
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
    expect(files.some((f) => f.relativePath === 'entry/src/main/js/default/common/back.png')).toBe(true);
  });

  it.each(['empty', 'list-demo'])('%s page uses the shared top nav and exits the app', (templateId) => {
    const files = renderProjectTemplate(templatesRoot, templateId, {
      bundleName: 'com.example.nav',
      vendor: 'example',
      sdkVersion: '6.1-lts',
      deviceProfileId: 'cp2a070-la401',
      display: { width: 1024, height: 600 },
    });
    const read = (suffix: string) =>
      new TextDecoder().decode(files.find((f) => f.relativePath.endsWith(suffix))!.content);
    const hml = read('js/default/pages/index/index.hml');
    for (const cls of ['page-head', 'back-btn', 'head-title', 'back-spacer', 'head-line', 'page-content']) {
      expect(hml).toContain(`class="${cls}"`);
    }
    expect(hml).toContain('onclick="onExit"');
    expect(hml).toContain('src="/common/back.png"');
    expect(read('pages/index/index.js')).toContain('app.terminate();');
    const css = read('pages/index/index.css');
    expect(css).toContain('.page-head');
    expect(css).toContain('height: 48px;');
    // ArkUI.Lite has no `flex` style; the shell uses explicit sizes from the device profile
    expect(css).not.toContain('flex:');
    expect(css).toContain('width: 1024px;');
    expect(css).toContain('height: 551px;');
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
