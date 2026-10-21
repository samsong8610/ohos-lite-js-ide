/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import type { ComponentsSchemaFile } from '@ohjs/schemas';
import { annotateValues, docValues } from './values';

describe('docValues', () => {
  it('boolean, "可选值为a，b，c", "- v：" lists; only string/boolean types', () => {
    expect(docValues('boolean | false | 否 | 是否选中。')).toEqual(['true', 'false']);
    expect(
      docValues(
        'string | button | 否 | 类型，可选值为button，checkbox、radio。 可选值定义如下： - button：按钮； - link：x',
      ),
    ).toEqual(['button', 'checkbox', 'radio', 'link']);
    expect(docValues('string | row | 否 | 可选项有： - column：垂直 - row：水平')).toEqual(['column', 'row']);
    expect(docValues('string | 00:00 | 否 | 格式为 HH:mm；')).toEqual([]);
    expect(docValues('number | 0 | 否 | 取值范围为0-100。')).toEqual([]);
    expect(docValues('string | - | 说明 - Foo：大写不算')).toEqual([]);
    expect(docValues(undefined)).toEqual([]);
  });
});

describe('annotateValues', () => {
  it('merges component_factory type variants (code) with docs; skips disabled variants', () => {
    const f = (doc?: string) => ({ availability: 'code' as const, evidence: [], ...(doc ? { doc } : {}) });
    const file = {
      components: {
        input: {
          variants: [
            { implClass: 'A', typeValues: ['button'], availability: 'code' },
            { implClass: 'B', typeValues: ['text'], availability: 'code' },
            { implClass: 'C', typeValues: ['date'], availability: 'disabled-by-feature' },
          ],
          attributes: { type: f('string | button | 可选值为button，radio。'), name: f('string | - | 名称') },
          styles: { 'text-align': f('string | left | 可选值为： - left：左 - right：右') },
        },
        x: {
          variants: [{ implClass: 'X', typeValues: ['a'], availability: 'code' }],
          attributes: { type: f() },
          styles: {},
        },
      },
      common: { attributes: { show: f('boolean | 显示') }, styles: { color: f('<color> | - | 颜色') } },
    } as unknown as ComponentsSchemaFile;
    annotateValues(file);
    expect(file.components['input']!.attributes['type']).toMatchObject({
      values: ['button', 'text', 'radio'],
      valuesSource: 'code+doc',
    });
    expect(file.components['input']!.attributes['name']!.values).toBeUndefined();
    expect(file.components['input']!.styles['text-align']).toMatchObject({
      values: ['left', 'right'],
      valuesSource: 'doc',
    });
    expect(file.components['x']!.attributes['type']).toMatchObject({ values: ['a'], valuesSource: 'code' });
    expect(file.common.attributes['show']!.valuesSource).toBe('doc');
    expect(file.common.styles['color']!.values).toBeUndefined();
  });
});
