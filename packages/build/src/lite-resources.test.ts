/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { enrichPackagedConfig, ensureDefaultLauncherIcon, findMediaFile } from './lite-resources';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function abilityOf(config: Record<string, unknown>, index = 0): Record<string, unknown> {
  const module = config['module'] as Record<string, unknown>;
  return (module['abilities'] as Record<string, unknown>[])[index]!;
}

describe('packaged launcher icon', () => {
  it('keeps $media:icon and records iconId the way DevEco does', () => {
    const packaged = enrichPackagedConfig(
      {
        app: { bundleName: 'com.example.hellolite' },
        module: {
          abilities: [
            {
              name: 'MyMainAbility',
              srcPath: 'MainAbility',
              type: 'page',
              icon: '$media:icon',
              label: '$string:MainAbility_label',
            },
          ],
        },
      },
      {
        mainAbility: 'MyMainAbility',
        deviceType: ['smartVision'],
        resourceTable: [
          { kind: 'string', name: 'MainAbility_label', id: 0x01000001 },
          { kind: 'media', name: 'icon', id: 0x01000003 },
        ],
      },
    );
    expect(abilityOf(packaged)).toMatchObject({
      icon: '$media:icon',
      iconId: 0x01000003,
      labelId: 0x01000001,
      srcPath: 'MainAbility',
    });
    expect(abilityOf(packaged)['visible']).toBeUndefined();
  });

  it('keeps an explicit path and does not invent visible', () => {
    const packaged = enrichPackagedConfig(
      {
        module: {
          abilities: [
            {
              name: 'default',
              type: 'page',
              icon: 'assets/entry/resources/base/media/icon.png',
              visible: false,
            },
          ],
        },
      },
      {
        mainAbility: 'default',
        deviceType: ['smartVision'],
        resourceTable: [],
      },
    );
    expect(abilityOf(packaged)).toMatchObject({
      icon: 'assets/entry/resources/base/media/icon.png',
      visible: false,
    });
    expect(abilityOf(packaged)['iconId']).toBeUndefined();
  });

  it('fills $media:icon when the page ability has none', () => {
    const packaged = enrichPackagedConfig(
      { module: { abilities: [{ name: 'default', type: 'page', label: 'My App' }] } },
      {
        mainAbility: 'default',
        deviceType: ['smartVision'],
        resourceTable: [{ kind: 'media', name: 'icon', id: 0x01000003 }],
      },
    );
    expect(abilityOf(packaged)).toMatchObject({ icon: '$media:icon', iconId: 0x01000003 });
    expect(abilityOf(packaged)['visible']).toBeUndefined();
  });

  it('injects the built-in icon file when the module ships none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-assets-'));
    tmpDirs.push(root);
    ensureDefaultLauncherIcon(root);
    expect(fs.existsSync(path.join(root, 'resources', 'base', 'media', 'icon.png'))).toBe(true);
  });

  it('does not replace an icon the module already staged', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-assets-'));
    tmpDirs.push(root);
    const mediaDir = path.join(root, 'resources', 'base', 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(path.join(mediaDir, 'icon.png'), 'keep');
    ensureDefaultLauncherIcon(root);
    expect(fs.readFileSync(path.join(mediaDir, 'icon.png'), 'utf8')).toBe('keep');
  });

  it('prefers png and falls back to another extension', () => {
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-media-'));
    tmpDirs.push(mediaDir);
    fs.writeFileSync(path.join(mediaDir, 'icon.jpg'), 'jpg');
    fs.writeFileSync(path.join(mediaDir, 'icon.png'), 'png');
    expect(findMediaFile(mediaDir, 'icon')).toBe('icon.png');
    fs.rmSync(path.join(mediaDir, 'icon.png'));
    expect(findMediaFile(mediaDir, 'icon')).toBe('icon.jpg');
    expect(findMediaFile(path.join(mediaDir, 'missing'), 'icon')).toBeUndefined();
  });

  it('fills a blank page icon and leaves service abilities unchanged', () => {
    const packaged = enrichPackagedConfig(
      {
        module: {
          abilities: [
            { name: 'default', icon: '' },
            { name: 'svc', type: 'service', label: 'Service' },
            'not-an-ability',
          ],
        },
      },
      {
        mainAbility: 'default',
        deviceType: ['smartVision'],
        resourceTable: [{ kind: 'media', name: 'icon', id: 0x01000001 }],
      },
    );
    expect(abilityOf(packaged)).toMatchObject({ icon: '$media:icon', iconId: 0x01000001 });
    expect(abilityOf(packaged)['visible']).toBeUndefined();
    expect(abilityOf(packaged, 1)).toEqual({ name: 'svc', type: 'service', label: 'Service' });
    expect((packaged['module'] as { abilities: unknown[] }).abilities[2]).toBe('not-an-ability');
  });
});
