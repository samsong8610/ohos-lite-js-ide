/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { conditionsByLine, findFunctions, lineAt, matchBrace, requiredFeature, stripComments } from './cpp';

export interface FactoryVariant {
  implClass: string;
  /** keyword enums of the `type` attribute selecting this class, empty = default branch */
  typeKeys: string[];
  feature?: string;
  line: number;
}

export interface FactoryRegistration {
  /** tag keyword enum, e.g. K_LIST */
  tagEnum: string;
  line: number;
  feature?: string;
  variants: FactoryVariant[];
}

/** Parses ComponentFactory::CreateComponent in component_factory.h (component scope, Q9). */
export function parseComponentFactory(text: string): FactoryRegistration[] {
  const src = stripComments(text);
  const conds = conditionsByLine(src);
  const [fn] = [...findFunctions(src, 'ComponentFactory', 'CreateComponent'), ...findInlineCreate(src)];
  if (!fn) throw new Error('component_factory.h: CreateComponent not found');
  const body = src.slice(fn.open, fn.close + 1);
  const caseRe = /\bcase\s+(K_[A-Z0-9_]+)\s*:/g;
  const cases = [...body.matchAll(caseRe)].map((m) => ({ tagEnum: m[1]!, at: fn.open + m.index! }));
  const regs: FactoryRegistration[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    const end = i + 1 < cases.length ? cases[i + 1]!.at : fn.close;
    const seg = src.slice(c.at, end);
    const line = lineAt(src, c.at);
    const feature = requiredFeature(conds[line] ?? []);
    const variants: FactoryVariant[] = [];
    // walk `new XComponent(` and the closest preceding condition on `id == K_Y`
    for (const m of seg.matchAll(/\bnew\s+(\w+Component)\s*\(/g)) {
      const before = seg.slice(0, m.index);
      const ifIdx = before.lastIndexOf('if (');
      let typeKeys: string[] = [];
      if (ifIdx >= 0 && !before.slice(ifIdx).includes('}')) {
        const open = before.indexOf('(', ifIdx);
        const close = matchParen(before, open);
        typeKeys = [...before.slice(open, close + 1).matchAll(/==\s*(K_[A-Z0-9_]+)/g)].map((x) => x[1]!);
      }
      const vLine = lineAt(src, c.at + m.index!);
      const vFeature = requiredFeature(conds[vLine] ?? []);
      variants.push({
        implClass: m[1]!,
        typeKeys,
        line: vLine,
        ...(vFeature && vFeature !== feature ? { feature: vFeature } : {}),
      });
    }
    if (variants.length === 0 && /component\s*=\s*nullptr/.test(seg)) continue;
    // `case K_A: case K_B:` fallthrough: an empty segment shares the next segment's variants
    regs.push({ tagEnum: c.tagEnum, line, ...(feature ? { feature } : {}), variants });
  }
  // resolve fallthrough
  for (let i = regs.length - 2; i >= 0; i--) {
    if (regs[i]!.variants.length === 0) regs[i]!.variants = regs[i + 1]!.variants;
  }
  return regs;
}

/** CreateComponent is defined inline in the class body: `static Component* CreateComponent(...) {`. */
function findInlineCreate(src: string): Array<{ name: string; open: number; close: number; line: number }> {
  const m = /\bCreateComponent\s*\([^)]*\)\s*\{/.exec(src);
  if (!m) return [];
  const open = m.index + m[0].length - 1;
  return [{ name: 'CreateComponent', open, close: matchBrace(src, open), line: lineAt(src, m.index) }];
}

function matchParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return i;
  }
  return src.length - 1;
}

/** `class X final : public Y` → Y */
export function baseClassOf(headerText: string, cls: string): string | undefined {
  const m = new RegExp(`class\\s+${cls}\\b[^:{;]*:\\s*public\\s+(\\w+)`).exec(stripComments(headerText));
  return m?.[1];
}

/** InputCheckboxComponent → input_checkbox_component */
export function classToFileStem(cls: string): string {
  return cls.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}
