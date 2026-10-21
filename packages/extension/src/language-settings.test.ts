/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { listSchemaVersions } from '@ohjs/schemas';
import { RULES } from '@ohjs/language-server';
import { languageDocumentSelector, sdkStatusText, resolveSdkVersion, sdkTooltip } from './language-settings';

describe('language client settings', () => {
  it('syncs all HML and OH-tree CSS/LESS/JS documents over file:', () => {
    const sel = languageDocumentSelector();
    expect(sel.map((s) => s.language)).toEqual(['hml', 'css', 'less', 'javascript', 'json', 'json']);
    expect(sel.every((s) => s.scheme === 'file')).toBe(true);
    expect(sel[0]!.pattern).toBeUndefined();
  });
  it('status bar text', () => {
    expect(sdkStatusText({ version: '5.0.3', ok: true, provisional: false })).toBe('$(versions) OH 5.0.3');
    expect(sdkStatusText({ version: '6.1-lts', ok: false, provisional: true })).toBe(
      '$(warning) OH 6.1-lts (provisional)',
    );
  });
  it('manifest: hml language, sdkVersion enum matches the bundled data packs, rule settings', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const hml = pkg.contributes.languages.find((l: { id: string }) => l.id === 'hml');
    expect(hml.extensions).toEqual(['.hml']);
    expect(fs.existsSync(path.join(__dirname, '..', hml.configuration))).toBe(true);
    const sdk = pkg.contributes.configuration.properties['ohjs.sdkVersion'];
    expect(sdk.enum).toEqual(listSchemaVersions().map((d) => d.slice(1)));
    expect(sdk.default).toBe('5.0.3');
    expect(pkg.contributes.configuration.properties['ohjs.lang.rules'].type).toBe('object');
    expect(pkg.activationEvents).toContain('onLanguage:hml');
    const lc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', hml.configuration), 'utf8'));
    expect(lc.comments.blockComment).toEqual(['<!--', '-->']);
  });
});

describe('resolveSdkVersion', () => {
  it('prefers .ohjs/project.json sdkVersion, falls back to the setting', () => {
    expect(resolveSdkVersion('{"sdkVersion":" 6.1-lts "}', '5.0.3')).toEqual({
      version: '6.1-lts',
      source: 'project',
    });
    expect(resolveSdkVersion(undefined, '5.0.3')).toEqual({ version: '5.0.3', source: 'setting' });
    expect(resolveSdkVersion('{"module":"entry"}', '6.1-lts')).toEqual({
      version: '6.1-lts',
      source: 'setting',
    });
    expect(resolveSdkVersion('{"sdkVersion": 5}', '5.0.3').source).toBe('setting');
    expect(resolveSdkVersion('{"sdkVersion": ""}', '5.0.3').source).toBe('setting');
    expect(resolveSdkVersion('{ "sdkVersion": "6.1', '5.0.3').source).toBe('setting');
    expect(resolveSdkVersion('null', '5.0.3').source).toBe('setting');
  });
});

describe('sdkTooltip', () => {
  const st = { version: '6.1-lts', ok: true, available: ['5.0.3', '6.1-lts'] };
  it('names the source and notes an overridden setting', () => {
    expect(sdkTooltip(st, { version: '6.1-lts', source: 'project' }, '5.0.3')).toBe(
      'OpenHarmony SDK 6.1-lts (from .ohjs/project.json)\nSetting value 5.0.3 is overridden by project.json\nAvailable: 5.0.3, 6.1-lts',
    );
    expect(sdkTooltip(st, { version: '6.1-lts', source: 'project' }, '6.1-lts')).toBe(
      'OpenHarmony SDK 6.1-lts (from .ohjs/project.json)\nAvailable: 5.0.3, 6.1-lts',
    );
    expect(sdkTooltip({ ...st, version: '5.0.3' }, { version: '5.0.3', source: 'setting' }, '5.0.3')).toBe(
      'OpenHarmony SDK 5.0.3 (from setting ohjs.sdkVersion)\nAvailable: 5.0.3, 6.1-lts',
    );
  });
  it('errors, and translation through the l10n bundles', () => {
    expect(sdkTooltip({ ...st, ok: false, error: 'boom' }, { version: 'x', source: 'setting' }, 'x')).toBe(
      'boom',
    );
    expect(sdkTooltip({ ...st, ok: false }, { version: 'x', source: 'setting' }, 'x')).toBe(
      'SDK switch failed',
    );
    const zh = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'l10n', 'bundle.l10n.zh-cn.json'), 'utf8'),
    ) as Record<string, string>;
    const en = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'l10n', 'bundle.l10n.json'), 'utf8'),
    ) as Record<string, string>;
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    const t = (m: string, ...a: Array<string | number | boolean>) =>
      zh[m]!.replace(/\{(\d+)\}/g, (_, i: string) => String(a[Number(i)]));
    expect(sdkTooltip(st, { version: '6.1-lts', source: 'project' }, '5.0.3', t)).toBe(
      'OpenHarmony SDK 6.1-lts（来自 .ohjs/project.json）\n设置值 5.0.3 被 project.json 覆盖\n可用版本：5.0.3, 6.1-lts',
    );
  });
  it('ohjs.lang.rules offers exactly the server rule IDs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.contributes.configuration.properties['ohjs.lang.rules'].propertyNames.enum).toEqual(
      Object.keys(RULES),
    );
  });
});
