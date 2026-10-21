/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type DocSection = 'attributes' | 'styles' | 'events' | 'methods' | 'directives';

export interface DocEntry {
  name: string;
  since?: number;
  /** remaining columns (type, default, description …) joined, HTML cleaned */
  doc: string;
  line: number;
  /** doc file the entry comes from */
  file: string;
}

export interface DocPage {
  tag: string;
  category: string;
  file: string;
  /** 'any' | 'none' | list of allowed child tags */
  children?: 'any' | 'none' | string[];
  sections: Partial<Record<DocSection, DocEntry[]>>;
  /** API version the component appeared in ("从API version 4 开始支持") */
  since?: number;
}

const SECTION_TITLES: Record<string, DocSection> = {
  属性: 'attributes',
  样式: 'styles',
  事件: 'events',
  方法: 'methods',
  渲染属性: 'directives',
  常规属性: 'attributes',
  通用属性: 'attributes',
  通用事件: 'events',
  通用样式: 'styles',
  Attributes: 'attributes',
  Styles: 'styles',
  Events: 'events',
  Methods: 'methods',
};

/** Splits a markdown table row on unescaped pipes. */
export function splitRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  const s = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

export function cleanCell(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<sup>[^<]*<\/sup>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expands documented name patterns: `padding-[left|top]` → padding-left, padding-top;
 * `[left|top]` → left, top; `a、b` / `a, b` → a, b. Returns names and the `<sup>N+</sup>` since.
 */
export function expandName(cell: string): { names: string[]; since?: number } {
  const sinceM = /<sup>\s*(\d+)\+?\s*<\/sup>/.exec(cell);
  let s = cell
    .replace(/<sup>[^<]*<\/sup>/g, '')
    .replace(/`/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  s = s.replace(/<[^>]+>/g, '').trim();
  const parts = s.split(/[、,，]\s*/).filter(Boolean);
  const names: string[] = [];
  for (const p of parts) {
    const m = /^(.*?)\[([^\]]+)\](.*)$/.exec(p.trim());
    if (m) for (const alt of m[2]!.split('|')) names.push(`${m[1]}${alt.trim()}${m[3]}`);
    else names.push(p.trim());
  }
  const valid = names.filter((n) => /^[a-zA-Z][\w-]*$/.test(n));
  return { names: valid, ...(sinceM ? { since: Number(sinceM[1]) } : {}) };
}

function parseChildren(text: string): DocPage['children'] {
  const t = text.trim();
  if (!t) return undefined;
  if (/不支持|无|None|not supported/i.test(t)) return 'none';
  const tags = [...t.matchAll(/&lt;\[?([a-z][a-z-]*)\]?/g), ...t.matchAll(/<\[([a-z][a-z-]*)\]/g)].map(
    (m) => m[1]!,
  );
  if (tags.length) return [...new Set(tags)];
  return 'any';
}

/** Parses one arkui-js-lite markdown page. */
export function parseDocPage(
  md: string,
  file: string,
  tag: string,
  category: string,
  defaultSection?: DocSection,
): DocPage {
  const lines = md.split('\n');
  const page: DocPage = { tag, category, file, sections: {} };
  const sinceM = /API\s*version\s*(\d+)\s*开始支持|since API version (\d+)/i.exec(md);
  if (sinceM) page.since = Number(sinceM[1] ?? sinceM[2]);
  let section: DocSection | 'children' | undefined = defaultSection;
  let childText = '';
  let header: string[] | undefined;
  /** tables introduced by a `**表N**` caption describe nested object types, not component fields */
  let captioned = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const h = /^#{2,4}\s+(.+?)\s*$/.exec(l);
    if (h) {
      const title = h[1]!.replace(/<sup>.*<\/sup>/, '').trim();
      section = title === '子组件' || title === 'Child Components' ? 'children' : SECTION_TITLES[title];
      header = undefined;
      captioned = false;
      continue;
    }
    if (/^\s*\*\*表\s*\d+\*\*|^\s*\*\*Table\s*\d+\*\*/.test(l)) {
      captioned = true;
      continue;
    }
    if (section === 'children') {
      if (l.trim()) childText += l + '\n';
      continue;
    }
    if (!section || !l.trim().startsWith('|')) {
      if (!l.trim().startsWith('|')) header = undefined;
      continue;
    }
    if (captioned) continue;
    const cells = splitRow(l);
    if (!header) {
      header = cells;
      continue;
    }
    // event payload / method parameter tables (`| 属性 | 类型 | 说明 |`, `| 参数名 | ...`)
    if (
      (section === 'events' || section === 'methods') &&
      /^(属性|参数|参数名|Name of parameter)$/.test(cleanCell(header[0] ?? ''))
    )
      continue;
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const { names, since } = expandName(cells[0] ?? '');
    const doc = cells.slice(1).map(cleanCell).filter(Boolean).join(' | ');
    const list = (page.sections[section] ??= []);
    for (const name of names) list.push({ name, doc, line: i + 1, file, ...(since ? { since } : {}) });
  }
  const children = parseChildren(childText);
  if (children) page.children = children;
  return page;
}

/** js-lite-components-container-list-item.md → { category: container, tag: list-item } */
export function docFileToTag(fileName: string): { tag: string; category: string } | undefined {
  const m = /^js-lite-components-(container|basic|canvas)-([a-z0-9-]+)\.md$/.exec(fileName);
  if (!m) return undefined;
  if (m[2] === 'canvasrenderingcontext2d') return undefined;
  return { category: m[1]!, tag: m[2]! };
}
