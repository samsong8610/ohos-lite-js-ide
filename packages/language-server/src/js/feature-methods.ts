/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// feature/rotation-disabled (FR-LANG-006, SPEC §4 "6.1-LTS 文档差异"): `rotation({focus})` on list / swiper /
// slider / picker-view is registered only under FEATURE_ROTATION_API, which the linux target leaves off,
// so `this.$refs.x.rotation(...)` is undefined at runtime on the board.
import type { Node } from 'acorn';
import type { ComponentsSchemaFile } from '@ohjs/schemas';
import type { Range } from '../hml/parser';
import { visit, type AnyNode } from './es5';

export interface MethodCall {
  method: string;
  /** the property name range */
  range: Range;
  /** `x` of `this.$refs.x.method()` / `this.$refs['x'].method()` */
  ref?: string;
}

function refName(obj: AnyNode): string | undefined {
  if (obj.type !== 'MemberExpression') return undefined;
  const inner = obj.object as AnyNode;
  if (inner.type !== 'MemberExpression') return undefined;
  const p = inner.property as AnyNode;
  if (inner.computed || p.type !== 'Identifier' || p.name !== '$refs') return undefined;
  const key = obj.property as AnyNode;
  if (!obj.computed && key.type === 'Identifier') return key.name as string;
  if (obj.computed && key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
}

/** `<expr>.name(...)` calls whose property is a plain identifier. */
export function methodCalls(ast: Node): MethodCall[] {
  const out: MethodCall[] = [];
  visit(ast as AnyNode, undefined, (n) => {
    if (n.type !== 'CallExpression') return;
    const callee = n.callee as AnyNode;
    if (callee.type !== 'MemberExpression' || callee.computed) return;
    const prop = callee.property as AnyNode;
    if (prop.type !== 'Identifier') return;
    const ref = refName(callee.object as AnyNode);
    out.push({
      method: prop.name as string,
      range: { start: prop.start, end: prop.end },
      ...(ref ? { ref } : {}),
    });
  });
  return out;
}

export interface FeatureMethodFinding {
  rule: 'feature/rotation-disabled';
  range: Range;
  message: string;
}

/**
 * `refTags` maps `ref` names in the page's .hml to their component tags. A call is reported when its
 * receiver resolves to a component whose `rotation` is disabled-by-feature, or when the receiver is a
 * `$refs` entry that cannot be resolved and some component has it disabled.
 */
export function checkFeatureMethods(
  calls: MethodCall[],
  schema: ComponentsSchemaFile,
  refTags: ReadonlyMap<string, string>,
): FeatureMethodFinding[] {
  const out: FeatureMethodFinding[] = [];
  const disabledIn = Object.values(schema.components).filter(
    (c) => c.methods['rotation']?.availability === 'disabled-by-feature',
  );
  if (!disabledIn.length) return out;
  const feature = disabledIn[0]!.methods['rotation']!.feature ?? 'its feature switch';
  for (const c of calls) {
    if (c.method !== 'rotation' || c.ref === undefined) continue;
    const tag = refTags.get(c.ref);
    const comp = tag ? schema.components[tag] : undefined;
    if (comp && comp.methods['rotation']?.availability !== 'disabled-by-feature') continue;
    if (tag && !comp) continue;
    out.push({
      rule: 'feature/rotation-disabled',
      range: c.range,
      message: `rotation() is not available on target ${schema.target}: ${feature} is off${tag ? ` (<${tag}>)` : ''}, so the call fails at runtime`,
    });
  }
  return out;
}
