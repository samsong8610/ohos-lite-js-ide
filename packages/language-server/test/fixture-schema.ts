/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ComponentSchema, ComponentsSchemaFile, FieldSchema } from '@ohjs/schemas';

const f = (
  availability: FieldSchema['availability'] = 'code',
  extra: Partial<FieldSchema> = {},
): FieldSchema => ({
  availability,
  evidence: [{ repo: 'engine', file: 'x.cpp', line: 1 }],
  ...extra,
});

const comp = (tag: string, extra: Partial<ComponentSchema> = {}): ComponentSchema => ({
  tag,
  category: 'basic',
  availability: 'code',
  implClasses: [],
  variants: [],
  attributes: {},
  styles: {},
  events: {},
  methods: {},
  docOnly: { attributes: [], styles: [], events: [], methods: [] },
  evidence: [],
  ...extra,
});

/** Small synthetic data pack covering every availability and children form. */
export function fixtureSchema(): ComponentsSchemaFile {
  return {
    schemaFormat: 1,
    ohVersion: '9.9',
    provisional: false,
    target: 'linux',
    generator: 'test',
    sources: [],
    features: {},
    components: {
      div: comp('div', { category: 'container', children: 'any', since: 4 }),
      list: comp('list', { category: 'container', children: ['list-item'], events: { scrollend: f() } }),
      'list-item': comp('list-item', { category: 'container', children: 'any' }),
      swiper: comp('swiper', { category: 'container', children: { except: ['list'] } }),
      text: comp('text', {
        children: 'none',
        attributes: { value: f('code', { doc: 'the text', since: 5 }) },
        docOnly: { attributes: ['legacy'], styles: [], events: ['oldevent'], methods: [] },
      }),
      input: comp('input', {
        children: 'none',
        attributes: {
          type: f(),
          secret: f('disabled-by-feature', { feature: 'FEATURE_SECRET' }),
          cam: f('conditional', { feature: 'FEATURE_CAM' }),
          hidden: f('code-doc-missing'),
        },
        events: { change: f(), gone: f('disabled-by-feature', { feature: 'FEATURE_GONE' }) },
      }),
      tabs: comp('tabs', {
        availability: 'disabled-by-feature',
        feature: 'FEATURE_COMPONENT_TABS',
        category: 'runtime-extension',
      }),
      tabs2: comp('tabs2', { availability: 'disabled-by-feature' }),
      video: comp('video', { availability: 'conditional', category: 'runtime-extension' }),
      camera: comp('camera', { availability: 'code-doc-missing', category: 'runtime-extension' }),
      free: comp('free'),
    },
    common: {
      attributes: { id: f(), class: f('framework'), show: f() },
      styles: {},
      events: { click: f(), touchStart: f('code-doc-missing') },
      directives: { for: f('framework'), if: f('framework'), else: f('framework') },
    },
    aceLoader: { imageExtensions: ['png'], specialStyles: {}, regexps: {} },
    warnings: [],
  };
}
