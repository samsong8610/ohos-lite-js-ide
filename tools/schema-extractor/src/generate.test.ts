/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateComponentsFile, type ComponentsSchemaFile } from '@ohjs/schemas';
import { camelToKebab, generateSchema, type SourceSet } from './generate';
import { writeMiniSources } from '../test/mini-sources';

let mini: ReturnType<typeof writeMiniSources>;
let schema: ComponentsSchemaFile;

beforeAll(() => {
  mini = writeMiniSources('a');
  schema = generateSchema({ ohVersion: '5.0.3', provisional: false, target: 'linux', ...mini });
});
afterAll(() => fs.rmSync(mini.root, { recursive: true, force: true }));

describe('generateSchema (synthetic sources)', () => {
  it('produces a file that validates against the data-pack JSON schema', () => {
    const r = validateComponentsFile(schema);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(schema.provisional).toBe(false);
    expect(schema.provisionalReason).toBeUndefined();
  });

  it('records git provenance read from .git without processes', () => {
    const engine = schema.sources.find((s) => s.repo === 'engine')!;
    expect(engine.commit).toBe('a'.repeat(40));
    expect(engine.tags).toEqual(['v-annotated']);
    expect(engine.remote).toBe('https://example.invalid/engine.git');
    expect(schema.sources.find((s) => s.repo === 'docs')!.commit).toBeUndefined();
  });

  it('lists components created by ComponentFactory only', () => {
    expect(Object.keys(schema.components)).toEqual(['div', 'foo', 'input', 'tabs']);
    expect(schema.warnings).toContain('factory tag K_UNREGISTERED not in keys.h');
    expect(schema.warnings).toContain('component <ghost> is documented but not created by ComponentFactory');
    expect(schema.warnings).toContain('component <foo> is implemented but has no documentation page');
    expect(schema.warnings).toContain('implementation of FooComponent (foo_component.cpp) not found');
  });

  it('marks feature-guarded components as disabled-by-feature', () => {
    const tabs = schema.components['tabs']!;
    expect(tabs.availability).toBe('disabled-by-feature');
    expect(tabs.feature).toBe('FEATURE_COMPONENT_TABS');
    expect(tabs.attributes['value']!.availability).toBe('disabled-by-feature');
    expect(schema.warnings.some((w) => w.includes('FEATURE_COMPONENT_TABS not defined'))).toBe(true);
    expect(schema.components['foo']!.category).toBe('runtime-extension');
  });

  it('follows style helpers but ignores value switches', () => {
    const div = schema.components['div']!;
    expect(Object.keys(div.styles)).toEqual(['flex-direction']);
    expect(div.styles['flex-direction']!.availability).toBe('code');
    expect(div.styles['flex-direction']!.doc).toBe('string | row | 否 | 主轴方向 可选');
    expect(div.styles['flex-direction']!.evidence.map((e) => e.repo)).toEqual(['engine', 'docs']);
    expect(div.docOnly.styles).toEqual(['flex-wrap']);
    // `id` documented on the page is a common attribute, not doc-only
    expect(div.docOnly.attributes).toEqual([]);
    expect(div.children).toBe('any');
    expect(div.since).toBe(4);
  });

  it('merges variants, the class chain, methods and the type attribute', () => {
    const input = schema.components['input']!;
    expect(input.children).toBe('none');
    expect(input.implClasses).toEqual(['InputCheckboxComponent', 'InputButtonComponent']);
    expect(input.variants).toEqual([
      { implClass: 'InputCheckboxComponent', typeValues: ['checkbox'], availability: 'code' },
      { implClass: 'InputButtonComponent', typeValues: [], availability: 'code' },
    ]);
    expect(Object.keys(input.attributes)).toEqual(['cameraOnly', 'checked', 'type', 'value']);
    expect(input.attributes['checked']!.since).toBe(5);
    expect(input.attributes['cameraOnly']!.availability).toBe('conditional');
    expect(input.attributes['type']!.evidence[0]!.file).toContain('component_factory.h');
    expect(input.attributes['type']!.availability).toBe('code');
    expect(input.docOnly.attributes).toEqual(['placeholder']);
    expect(input.events['change']!.availability).toBe('code');
    expect(input.docOnly.events).toEqual([]);
    expect(Object.keys(input.methods)).toEqual(['focus', 'literal', 'toggle']);
    expect(input.methods['literal']!.availability).toBe('code-doc-missing');
    expect(schema.warnings.some((w) => w.includes('K_NOT_IN_KEYS not found in keys.h'))).toBe(true);
    expect(schema.warnings.some((w) => w.includes('cannot resolve method name "UNKNOWN_CONST"'))).toBe(true);
  });

  it('builds the common attributes, styles, events and directives', () => {
    const c = schema.common;
    expect(c.attributes['id']!.availability).toBe('code');
    expect(c.attributes['show']!.availability).toBe('code');
    expect(c.attributes['class']!.availability).toBe('framework');
    expect(c.attributes['ref']).toEqual({ availability: 'framework', evidence: [] });
    expect(schema.warnings).toContain('common attribute "disabled" documented but not implemented');
    expect(c.styles['border-left-color']!.availability).toBe('code');
    expect(c.styles['width']!.availability).toBe('code');
    expect(schema.warnings).toContain('common style "border-right-color" documented but not implemented');
    expect(schema.warnings.some((w) => w.includes('aliceblue'))).toBe(false);
    expect(c.events['click']!.availability).toBe('code');
    expect(schema.warnings).toContain('common event "longpress" documented but not implemented');
    expect(Object.keys(c.directives)).toEqual(['elif', 'for', 'if', 'show', 'tid']);
  });

  it('reports features and ace-loader rules', () => {
    expect(schema.features['FEATURE_COMPONENT_CANVAS']).toEqual({ value: true });
    expect(schema.features['FEATURE_CAMERA_X']!.value).toBe('conditional');
    expect(schema.aceLoader.imageExtensions).toEqual(['bmp', 'jpg', 'png']);
    expect(schema.aceLoader.specialStyles).toEqual({ ANIMATION_DELAY: 'animationDelay' });
  });

  it('carries the provisional reason', () => {
    const s = generateSchema({
      ohVersion: '6.1-LTS',
      provisional: true,
      provisionalReason: 'not verified',
      target: 'linux',
      ...mini,
    });
    expect(s.provisional).toBe(true);
    expect(s.provisionalReason).toBe('not verified');
  });

  it('fails clearly when a required file is missing', () => {
    const set: SourceSet = { ohVersion: 'x', provisional: false, target: 'nope', ...mini };
    expect(() => generateSchema(set)).toThrow(/missing source file .*targets\/nope\/acelite_config.h/);
  });

  it('fails when component.cpp is absent', () => {
    const m = writeMiniSources('a');
    fs.rmSync(path.join(m.engine, 'frameworks/src/core/components/component.cpp'));
    expect(() => generateSchema({ ohVersion: 'x', provisional: false, target: 'linux', ...m })).toThrow(
      'component.cpp not found',
    );
    fs.rmSync(m.root, { recursive: true, force: true });
  });

  it('tolerates missing common doc pages', () => {
    const m = writeMiniSources('a');
    const d = path.join(m.docs, 'zh-cn/application-dev/reference/apis-arkui/arkui-js-lite');
    for (const f of [
      'js-lite-common-attributes.md',
      'js-lite-common-styles.md',
      'js-lite-common-events.md',
      'js-lite-framework-syntax-hml.md',
    ]) {
      fs.rmSync(path.join(d, f));
    }
    const s = generateSchema({ ohVersion: 'x', provisional: false, target: 'linux', ...m });
    expect(s.common.directives).toEqual({});
    expect(s.common.attributes['id']!.availability).toBe('code-doc-missing');
    expect(s.common.attributes['style']).toEqual({ availability: 'framework', evidence: [] });
    fs.rmSync(m.root, { recursive: true, force: true });
  });
});

describe('camelToKebab', () => {
  it('converts runtime style keys to CSS names', () => {
    expect(camelToKebab('flexDirection')).toBe('flex-direction');
    expect(camelToKebab('borderLeftColor')).toBe('border-left-color');
    expect(camelToKebab('analog-clock')).toBe('analog-clock');
  });
});
