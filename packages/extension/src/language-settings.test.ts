/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { listSchemaVersions } from '@ohjs/schemas';
import { languageDocumentSelector, sdkStatusText } from './language-settings';

describe('language client settings', () => {
  it('syncs all HML and OH-tree CSS/LESS/JS documents over file:', () => {
    const sel = languageDocumentSelector();
    expect(sel.map((s) => s.language)).toEqual(['hml', 'css', 'less', 'javascript']);
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
