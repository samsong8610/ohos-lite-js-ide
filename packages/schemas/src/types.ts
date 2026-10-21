/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** file is relative to the named source repository root */
export interface Evidence {
  repo: string;
  file: string;
  line: number;
}

/**
 * - code: dispatched by the runtime implementation and documented
 * - code-doc-missing: implemented but not in the official docs (FR-LANG-003: warn, do not error)
 * - disabled-by-feature: guarded by a FEATURE_* macro that is off for the target
 * - conditional: guarded by a macro that depends on external build flags
 * - framework: handled by the JS framework / ace-loader rather than a component class
 */
export type Availability = 'code' | 'code-doc-missing' | 'disabled-by-feature' | 'conditional' | 'framework';

export interface FieldSchema {
  availability: Availability;
  /** API version from docs `<sup>N+</sup>` */
  since?: number;
  feature?: string;
  doc?: string;
  /** enumerated values for completion: `type` variants from component_factory (code) and/or doc value lists */
  values?: string[];
  valuesSource?: 'code' | 'doc' | 'code+doc';
  evidence: Evidence[];
}

export interface VariantSchema {
  implClass: string;
  /** values of the `type` attribute selecting this impl; empty = default */
  typeValues: string[];
  feature?: string;
  availability: Availability;
}

export interface ComponentSchema {
  tag: string;
  category: string;
  availability: Availability;
  feature?: string;
  since?: number;
  /** allowed children (from docs): 'any', 'none', an allow-list, or `{ except }` deny-list */
  children?: 'any' | 'none' | string[] | { except: string[] };
  implClasses: string[];
  variants: VariantSchema[];
  attributes: Record<string, FieldSchema>;
  styles: Record<string, FieldSchema>;
  events: Record<string, FieldSchema>;
  methods: Record<string, FieldSchema>;
  /** documented names with no implementation evidence (shown, flagged as doc-only) */
  docOnly: { attributes: string[]; styles: string[]; events: string[]; methods: string[] };
  evidence: Evidence[];
}

export interface SourceInfo {
  repo: string;
  path: string;
  commit?: string;
  tags: string[];
  remote?: string;
}

export interface ComponentsSchemaFile {
  schemaFormat: 1;
  ohVersion: string;
  provisional: boolean;
  provisionalReason?: string;
  target: string;
  generator: string;
  sources: SourceInfo[];
  features: Record<string, { value: boolean | 'conditional'; dependsOn?: string[] }>;
  components: Record<string, ComponentSchema>;
  common: {
    attributes: Record<string, FieldSchema>;
    styles: Record<string, FieldSchema>;
    events: Record<string, FieldSchema>;
    directives: Record<string, FieldSchema>;
  };
  aceLoader: {
    imageExtensions: string[];
    specialStyles: Record<string, string>;
    regexps: Record<string, string>;
  };
  warnings: string[];
}

/** availability of a `@system.*` / `@ohos.*` native module for the target */
export type ModuleAvailability = 'available' | 'disabled-by-feature' | 'conditional';

export interface SystemModuleSchema {
  /** name after the category prefix: `router` for `@system.router` */
  name: string;
  availability: ModuleAvailability;
  /** FEATURE_* / ENABLE_* macro guarding the registration */
  feature?: string;
  evidence: Evidence[];
}

/** `<version>/system-modules.json`: native JS modules registered in OHOS_MODULES (module_manager/ohos_module_config.h). */
export interface SystemModulesFile {
  schemaFormat: 1;
  ohVersion: string;
  target: string;
  generator: string;
  /** accepted import prefixes: `@system.` and `@ohos.` (ModuleManager CATEGORY_SYSTEM / CATEGORY_OHOS) */
  categories: string[];
  modules: SystemModuleSchema[];
}
