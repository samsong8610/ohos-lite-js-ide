/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ComponentSchema, ComponentsSchemaFile, FieldSchema } from '@ohjs/schemas';

export interface NamedField {
  name: string;
  field: FieldSchema;
  /** 'component' = specific to the tag, 'common' = shared by all components, 'directive' = for/if/… */
  origin: 'component' | 'common' | 'directive';
}

/** Read-only queries over one components.json data pack, used by completion and diagnostics. */
export class SchemaView {
  constructor(readonly schema: ComponentsSchemaFile) {}

  component(tag: string): ComponentSchema | undefined {
    return Object.prototype.hasOwnProperty.call(this.schema.components, tag)
      ? this.schema.components[tag]
      : undefined;
  }

  /** Components that are usable for the target (not compiled out by a FEATURE macro). */
  usableComponents(): ComponentSchema[] {
    return Object.values(this.schema.components).filter((c) => c.availability !== 'disabled-by-feature');
  }

  /** Is `child` permitted directly inside `parent` according to the docs' child-component constraint? */
  allowsChild(parent: string, child: string): boolean {
    const c = this.component(parent);
    if (!c || c.children === undefined || c.children === 'any') return true;
    if (c.children === 'none') return false;
    if (Array.isArray(c.children)) return c.children.includes(child);
    return !c.children.except.includes(child);
  }

  /** Attributes valid on the tag: component-specific, then common, then directives (component wins). */
  attributes(tag: string): NamedField[] {
    const c = this.component(tag);
    const out = new Map<string, NamedField>();
    for (const [name, field] of Object.entries(this.schema.common.directives))
      out.set(name, { name, field, origin: 'directive' });
    for (const [name, field] of Object.entries(this.schema.common.attributes))
      out.set(name, { name, field, origin: 'common' });
    for (const [name, field] of Object.entries(c?.attributes ?? {}))
      out.set(name, { name, field, origin: 'component' });
    return [...out.values()];
  }

  attribute(tag: string, name: string): NamedField | undefined {
    return this.attributes(tag).find((a) => a.name === name);
  }

  events(tag: string): NamedField[] {
    const c = this.component(tag);
    const out = new Map<string, NamedField>();
    for (const [name, field] of Object.entries(this.schema.common.events))
      out.set(name, { name, field, origin: 'common' });
    for (const [name, field] of Object.entries(c?.events ?? {}))
      out.set(name, { name, field, origin: 'component' });
    return [...out.values()];
  }

  /**
   * Event lookup. Runtime keys in keys.h are matched case-insensitively here because several of them are
   * camel-cased (touchStart / touchEnd) while the docs and ace-loader use lower case.
   */
  event(tag: string, name: string): NamedField | undefined {
    const lower = name.toLowerCase();
    return this.events(tag).find((e) => e.name.toLowerCase() === lower);
  }

  /** Documented names that have no implementation evidence (do not complete; warn when used). */
  docOnlyAttributes(tag: string): string[] {
    return this.component(tag)?.docOnly.attributes ?? [];
  }

  docOnlyEvents(tag: string): string[] {
    return this.component(tag)?.docOnly.events ?? [];
  }
}
