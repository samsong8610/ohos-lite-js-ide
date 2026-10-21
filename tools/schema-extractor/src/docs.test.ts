/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { cleanCell, docFileToTag, expandName, parseDocPage, splitRow } from './docs';

describe('markdown helpers', () => {
  it('splitRow honours escaped pipes', () => {
    expect(splitRow('| a | b\\|c | d |')).toEqual(['a', 'b|c', 'd']);
  });
  it('cleanCell strips html, links and entities', () => {
    expect(cleanCell('x<br/>y&nbsp;&lt;z&gt; <sup>5+</sup>[link](a.md) <b>b</b>')).toBe('x y <z> link b');
  });
  it('expandName expands patterns and reads since', () => {
    expect(expandName('padding-[left\\|top]'.replace('\\|', '|'))).toEqual({
      names: ['padding-left', 'padding-top'],
    });
    expect(expandName('swipe<sup>5+</sup>')).toEqual({ names: ['swipe'], since: 5 });
    expect(expandName('`a`、b, c')).toEqual({ names: ['a', 'b', 'c'] });
    expect(expandName('<span>x</span>')).toEqual({ names: ['x'] });
    expect(expandName('-').names).toEqual([]);
  });
  it('docFileToTag', () => {
    expect(docFileToTag('js-lite-components-container-list-item.md')).toEqual({
      tag: 'list-item',
      category: 'container',
    });
    expect(docFileToTag('js-lite-components-canvas-canvasrenderingcontext2d.md')).toBeUndefined();
    expect(docFileToTag('js-lite-common-styles.md')).toBeUndefined();
  });
});

describe('parseDocPage', () => {
  it('reads sections, children, since and skips nested tables', () => {
    const md = `# list
从API version 4 开始支持。

## 子组件

仅支持&lt;[list-item](js-lite-components-container-list-item.md)&gt;。

## 属性<sup>5+</sup>

| 名称 | 类型 |
| -- | -- |
| a | string |

paragraph

| 名称 | 类型 |
| -- | -- |
| b | number |

## Events

| Name | Description |
| -- | -- |
| scroll | x |

**Table 1** payload

| Name | Type |
| -- | -- |
| nested | x |

## 方法

| 参数名 | 类型 |
| -- | -- |
| p | x |

## 示例

| x | y |
| -- | -- |
| ignored | z |
`;
    const p = parseDocPage(md, 'f.md', 'list', 'container');
    expect(p.since).toBe(4);
    expect(p.children).toEqual(['list-item']);
    expect(p.sections.attributes!.map((e) => e.name)).toEqual(['a', 'b']);
    expect(p.sections.attributes![0]).toEqual({ name: 'a', doc: 'string', line: 12, file: 'f.md' });
    expect(p.sections.events!.map((e) => e.name)).toEqual(['scroll']);
    expect(p.sections.methods).toBeUndefined();
  });
  it('children variants and default section', () => {
    expect(parseDocPage('## 子组件\n\n不支持。\n', 'f', 't', 'basic').children).toBe('none');
    expect(parseDocPage('## 子组件\n\n支持。\n', 'f', 't', 'basic').children).toBe('any');
    expect(parseDocPage('# x\n', 'f', 't', 'basic').children).toBeUndefined();
    expect(parseDocPage('## 子组件\n\n支持除&lt;list&gt;之外的子组件。\n', 'f', 't', 'c').children).toEqual({
      except: ['list'],
    });
    const p = parseDocPage('| 名称 | x |\n| -- | -- |\n| click | - |\n', 'f', '*', 'common', 'events');
    expect(p.sections.events!.map((e) => e.name)).toEqual(['click']);
  });
});
