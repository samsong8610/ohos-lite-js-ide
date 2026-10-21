/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { loadComponentsSchema } from '@ohjs/schemas';
import { missingSources, parseSourcesConfig } from './config';
import { generateSchema } from './generate';

// Integration test against the real OpenHarmony checkouts; skipped (not failed) when they are absent.
const cfg = parseSourcesConfig(fs.readFileSync(path.join(__dirname, '../sources.json'), 'utf8'), process.env);
const v503 = cfg.versions.find((v) => v.ohVersion === '5.0.3')!;
const have = missingSources(v503).length === 0;

describe.skipIf(!have)('real OpenHarmony 5.0.3 sources', () => {
  const s = have ? generateSchema(v503) : undefined!;
  it('extracts the 24 factory components', () => {
    expect(Object.keys(s.components)).toHaveLength(24);
    for (const t of [
      'div',
      'list',
      'list-item',
      'stack',
      'swiper',
      'text',
      'image',
      'input',
      'slider',
      'switch',
      'progress',
      'chart',
      'canvas',
      'qrcode',
      'marquee',
      'picker-view',
      'image-animator',
    ]) {
      expect(s.components[t]?.availability, t).toBe('code');
    }
    expect(s.components['tabs']!.availability).toBe('disabled-by-feature');
    expect(s.components['video']!.availability).toBe('conditional');
  });
  it('known facts with evidence (M1-5 acceptance samples)', () => {
    const list = s.components['list']!;
    expect(list.events['scrollend']!.evidence[0]!.file).toBe(
      'frameworks/src/core/components/list_component.cpp',
    );
    expect(list.methods['scrollTo']!.availability).toBe('code');
    expect(list.methods['rotation']!.availability).toBe('disabled-by-feature');
    expect(s.components['div']!.styles['flex-direction']!.availability).toBe('code');
    expect(s.components['input']!.attributes['type']!.availability).toBe('code');
    expect(s.components['text']!.styles['text-overflow']!.doc).toContain('clip');
    expect(s.common.styles['width']!.availability).toBe('code');
    expect(s.common.styles['width']!.doc).toContain('<length>');
    expect(s.common.directives['for']!.availability).toBe('framework');
    expect(s.aceLoader.imageExtensions).toEqual(['bmp', 'jpeg', 'jpg', 'png']);
    expect(s.sources[0]!.tags).toContain('OpenHarmony-v5.0.3-Release');
  });
  it('matches the committed data pack', () => {
    const committed = loadComponentsSchema('5.0.3');
    expect(JSON.parse(JSON.stringify(s))).toEqual(committed);
  });
});
