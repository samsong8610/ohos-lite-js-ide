/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Enumerated attribute/style values for completion (FR-LANG-004 "属性名和枚举值").
// Code evidence: the `type` values selecting a component_factory variant. Doc evidence: the docs table
// cell ("boolean | …", "可选值为a，b，c", "- value：description" lists). Never invents values.
import type { ComponentsSchemaFile, FieldSchema } from '@ohjs/schemas';

const IDENT = /^[a-z][a-z0-9-]*$/;

/** Values named by a docs table cell (`<type> | <default> | … | <description>`). */
export function docValues(doc: string | undefined): string[] {
  if (!doc) return [];
  const type = doc.split('|')[0]!.trim();
  if (type === 'boolean') return ['true', 'false'];
  if (type !== 'string') return [];
  const out: string[] = [];
  const add = (v: string): void => {
    const t = v.trim();
    if (IDENT.test(t) && !out.includes(t)) out.push(t);
  };
  // "可选值为button，checkbox，radio。"
  for (const m of doc.matchAll(
    /可选(?:值|项)(?:为|有)\s*([a-z][a-z0-9-]*(?:\s*[，,、]\s*[a-z][a-z0-9-]*)+)/g,
  ))
    for (const v of m[1]!.split(/[，,、]/)) add(v);
  // "- stretch：…" list items (only after an "可选值/可选项" or the description of an enum-like value list)
  if (/可选(?:值|项)|- [a-z][a-z0-9-]*[：:]/.test(doc))
    for (const m of doc.matchAll(/(?:^|\s)- ([a-z][a-z0-9-]*)\s*[：:]/g)) add(m[1]!);
  return out;
}

function annotate(field: FieldSchema, code: string[] = []): void {
  const doc = docValues(field.doc);
  const values = [...code];
  for (const v of doc) if (!values.includes(v)) values.push(v);
  if (values.length === 0) return;
  field.values = values;
  field.valuesSource = code.length && doc.length ? 'code+doc' : code.length ? 'code' : 'doc';
}

/** Adds `values` / `valuesSource` to every attribute and style field in place. */
export function annotateValues(file: ComponentsSchemaFile): ComponentsSchemaFile {
  for (const c of Object.values(file.components)) {
    const types = c.variants.flatMap((v) => (v.availability === 'disabled-by-feature' ? [] : v.typeValues));
    for (const [name, f] of Object.entries(c.attributes))
      annotate(f, name === 'type' ? [...new Set(types)] : []);
    for (const f of Object.values(c.styles)) annotate(f);
  }
  for (const f of Object.values(file.common.attributes)) annotate(f);
  for (const f of Object.values(file.common.styles)) annotate(f);
  return file;
}
