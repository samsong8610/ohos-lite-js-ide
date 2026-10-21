/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { classifyAttribute } from './attribute-names';
import { elementAt, parseHml, walk } from './parser';
import { LineIndex } from '../text';

describe('parseHml', () => {
  it('builds a tree with exact offsets', () => {
    const t = '<div class="a" show>\n  <text value=\'{{msg}}\' x=bare>hi</text>\n</div>';
    const d = parseHml(t);
    expect(d.problems).toEqual([]);
    const div = d.roots[0]!;
    expect(div.tag).toBe('div');
    expect(div.closed).toBe(true);
    expect(t.slice(div.range.start, div.range.end)).toBe(t);
    expect(div.attributes.map((a) => [a.name, a.value, a.quote])).toEqual([
      ['class', 'a', '"'],
      ['show', undefined, undefined],
    ]);
    const text = div.children[0]!;
    expect(text.parent).toBe(div);
    expect(text.attributes[0]!.value).toBe('{{msg}}');
    expect(t.slice(text.attributes[0]!.valueRange!.start, text.attributes[0]!.valueRange!.end)).toBe(
      '{{msg}}',
    );
    expect(text.attributes[1]).toMatchObject({ name: 'x', value: 'bare' });
    expect(t.slice(text.endTagRange!.start, text.endTagRange!.end)).toBe('</text>');
    expect([...walk(d.roots)].map((e) => e.tag)).toEqual(['div', 'text']);
  });

  it('handles self-closing tags, comments, stray < and attribute edge cases', () => {
    const d = parseHml('<!-- c --><image src="a.png"/> a < b <div a = "1" / b=x><i/></div>');
    expect(d.comments).toEqual([{ text: ' c ', range: { start: 0, end: 10 } }]);
    expect(d.roots.map((e) => [e.tag, e.selfClosing, e.closed])).toEqual([
      ['image', true, true],
      ['div', false, true],
    ]);
    const div = d.roots[1]!;
    expect(div.attributes.map((a) => [a.name, a.value])).toEqual([
      ['a', '1'],
      ['b', 'x'],
    ]);
    expect(div.children[0]!.tag).toBe('i');
    expect(d.problems).toEqual([]);
  });

  it('is tolerant: unclosed, unmatched, unterminated', () => {
    const d = parseHml('<div><text></div></span><list');
    expect(d.problems.map((p) => p.code)).toEqual([
      'unclosed-tag',
      'unmatched-close-tag',
      'unterminated-start-tag',
    ]);
    expect(d.roots.map((e) => e.tag)).toEqual(['div', 'list']);
    expect(d.roots[0]!.children[0]!.closed).toBe(false);
    const c = parseHml('<div>\n<!-- open');
    expect(c.problems.map((p) => p.code)).toEqual(['unterminated-comment', 'unclosed-tag']);
    expect(c.comments[0]!.text).toBe(' open');
    const q = parseHml('<div a="never closed');
    expect(q.roots[0]!.attributes[0]!.value).toBe('never closed');
    expect(q.problems[0]!.code).toBe('unterminated-start-tag');
    const lt = parseHml('<div a="1" <text>');
    expect(lt.roots[0]!.startTagClosed).toBe(false);
    expect(lt.roots[1]!.tag).toBe('text');
  });

  it('end tag without ">" stops before the next tag', () => {
    const d = parseHml('<div></div <text></text>');
    expect(d.roots.map((e) => e.tag)).toEqual(['div', 'text']);
    expect(d.roots[0]!.endTagRange).toEqual({ start: 5, end: 10 });
  });

  it('elementAt finds the innermost element', () => {
    const t = '<div><text></text></div>';
    const d = parseHml(t);
    expect(elementAt(d, t.indexOf('</text>'))!.tag).toBe('text');
    expect(elementAt(d, 0)).toBeUndefined();
    expect(elementAt(d, t.length)!.tag).toBe('div');
  });
});

describe('classifyAttribute', () => {
  it('recognises every event binding prefix and modifiers', () => {
    expect(classifyAttribute('onclick')).toEqual({
      kind: 'event',
      event: 'click',
      prefix: 'on',
      modifiers: [],
    });
    expect(classifyAttribute('@click')).toMatchObject({ event: 'click', prefix: '@' });
    expect(classifyAttribute('on:click.bubble')).toEqual({
      kind: 'event',
      event: 'click',
      prefix: 'on:',
      modifiers: ['bubble'],
    });
    expect(classifyAttribute('grab:touchstart')).toMatchObject({ event: 'touchstart', prefix: 'grab:' });
    expect(classifyAttribute('on')).toEqual({ kind: 'plain', name: 'on' });
    expect(classifyAttribute('value')).toEqual({ kind: 'plain', name: 'value' });
  });
});

describe('LineIndex', () => {
  it('treats \\n, \\r\\n and \\r as line ends', () => {
    const li = new LineIndex('a\nb\r\nc\rd');
    expect([0, 2, 5, 7].map((o) => li.lineOf(o))).toEqual([0, 1, 2, 3]);
    expect(li.lineOf(1)).toBe(0);
  });
});
