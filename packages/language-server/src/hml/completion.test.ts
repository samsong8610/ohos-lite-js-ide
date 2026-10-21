/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { loadComponentsSchema } from '@ohjs/schemas';
import { fixtureSchema } from '../../test/fixture-schema';
import { completeHml, completionContext } from './completion';
import { parseHml } from './parser';
import { SchemaView } from './schema-view';

const view = new SchemaView(fixtureSchema());
/** `|` marks the cursor */
const at = (marked: string) => {
  const offset = marked.indexOf('|');
  const text = marked.slice(0, offset) + marked.slice(offset + 1);
  return { doc: parseHml(text), offset, text };
};
const labels = (marked: string, v = view) => {
  const { doc, offset } = at(marked);
  return completeHml(doc, offset, v).map((c) => c.label);
};

describe('completionContext', () => {
  it('detects tag names, close tags, attribute names and values', () => {
    const k = (m: string) => {
      const { doc, offset } = at(m);
      return completionContext(doc, offset).kind;
    };
    expect(k('<|')).toBe('tagName');
    expect(k('<di|v></div>')).toBe('tagName');
    expect(k('<div></|')).toBe('closeTag');
    expect(k('<div |')).toBe('attributeName');
    expect(k('<div cl|ass="a">')).toBe('attributeName');
    expect(k('<div class="|">')).toBe('attributeValue');
    expect(k('<div class="a"|>')).toBe('none');
    expect(k('<div>|</div>')).toBe('none');
    expect(k('<div>text |</div>')).toBe('none');
    expect(k('<!-- <| -->')).toBe('none');
    expect(k('|')).toBe('none');
    expect(k('<div|')).toBe('tagName');
  });
});

describe('completeHml', () => {
  it('tags: usable components only, constrained by the parent', () => {
    const top = labels('<|');
    expect(top).toContain('div');
    expect(top).toContain('video'); // conditional components complete (Q9)
    expect(top).toContain('camera');
    expect(top).not.toContain('tabs'); // disabled by FEATURE
    expect(labels('<list>\n  <|\n</list>')).toEqual(['list-item']);
    expect(labels('<swiper><|</swiper>')).not.toContain('list');
    expect(labels('<text><|</text>')).toEqual([]);
    expect(labels('<foo><|</foo>')).toContain('div'); // unknown parent → no constraint
  });
  it('tag items carry snippets and replace the typed prefix', () => {
    const { doc, offset } = at('<di|');
    const items = completeHml(doc, offset, view);
    const div = items.find((c) => c.label === 'div')!;
    expect(div).toMatchObject({ insertText: 'div$1>$0</div>', snippet: true, replace: { start: 1, end: 3 } });
    expect(div.detail).toBe('container · since API 4');
    expect(items.find((c) => c.label === 'text')!.insertText).toBe('text$1></text>');
    expect(items.find((c) => c.label === 'video')!.detail).toContain('depends on build flags');
    expect(items.find((c) => c.label === 'camera')!.detail).toContain('undocumented');
  });
  it('close tag for the open element', () => {
    const { doc, offset } = at('<div><text></text></|');
    const items = completeHml(doc, offset, view);
    expect(items).toEqual([
      {
        label: '/div',
        kind: 'closeTag',
        insertText: '</div>',
        snippet: false,
        replace: { start: 18, end: 20 },
      },
    ]);
    expect(labels('<div></div></|')).toEqual([]);
    expect(labels('</|')).toEqual([]);
  });
  it('attributes: component first, then common, directives; skips present and disabled ones', () => {
    const { doc, offset } = at('<input id="a" |');
    const items = completeHml(doc, offset, view);
    const names = items.map((c) => c.label);
    expect(names).toEqual(
      expect.arrayContaining([
        'type',
        'cam',
        'hidden',
        'class',
        'show',
        'for',
        'if',
        'else',
        'onchange',
        'onclick',
        'ontouchstart',
      ]),
    );
    expect(names).not.toContain('id');
    expect(names).not.toContain('secret');
    expect(names).not.toContain('ongone');
    const type = items.find((c) => c.label === 'type')!;
    expect(type.sortText! < items.find((c) => c.label === 'class')!.sortText!).toBe(true);
    expect(
      items.find((c) => c.label === 'class')!.sortText! < items.find((c) => c.label === 'for')!.sortText!,
    ).toBe(true);
    expect(items.find((c) => c.label === 'else')!).toMatchObject({
      insertText: 'else',
      snippet: false,
      kind: 'directive',
    });
    expect(items.find((c) => c.label === 'cam')!.detail).toBe('depends on build flags (FEATURE_CAM)');
    expect(items.find((c) => c.label === 'hidden')!.detail).toBe('implemented in the engine, undocumented');
  });
  it('attribute docs and since; events in on/@ forms, skipping bound ones', () => {
    const t = labels('<text onclick="a" |');
    expect(t).not.toContain('onclick');
    expect(t).toContain('ontouchstart');
    expect(labels('<text @|')).toEqual(expect.arrayContaining(['@click', '@touchstart']));
    expect(labels('<text @click="x" @|')).not.toContain('@click');
    const { doc, offset } = at('<text v|');
    const value = completeHml(doc, offset, view).find((c) => c.label === 'value')!;
    expect(value).toMatchObject({
      detail: 'since API 5',
      documentation: 'the text',
      insertText: 'value="$1"',
      replace: { start: 6, end: 7 },
    });
    expect(labels('<foo |')).toEqual([]);
    expect(labels('<text value="|"')).toEqual([]);
  });
  it('real 5.0.3 pack: list children and list events', () => {
    const v = new SchemaView(loadComponentsSchema('5.0.3'));
    expect(labels('<list><|</list>', v)).toEqual(['list-item']);
    const listAttrs = labels('<list |', v);
    expect(listAttrs).toEqual(expect.arrayContaining(['onscrollend', 'onscrolltop', 'class', 'for']));
    // itemselected / scrollstart need FEATURE_LIST_SPECIFIC_EVENT_ENABLE, which is off on linux
    expect(listAttrs).not.toContain('onitemselected');
    expect(labels('<|', v)).not.toContain('tabs');
  });
});
