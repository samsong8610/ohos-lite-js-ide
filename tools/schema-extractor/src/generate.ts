/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { annotateValues } from './values';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Availability,
  ComponentSchema,
  ComponentsSchemaFile,
  Evidence,
  FieldSchema,
  SourceInfo,
  VariantSchema,
} from '@ohjs/schemas';
import { extractLiteEnum, imageExtensions } from './ace-loader';
import { COMMON, scanComponentImpl, type ImplFact, type MethodFact, type SourceFile } from './component-impl';
import { stringConstants, stripComments } from './cpp';
import { docFileToTag, parseDocPage, type DocEntry, type DocPage, type DocSection } from './docs';
import { baseClassOf, classToFileStem, parseComponentFactory } from './factory';
import { featureSwitches, parseAceliteConfig, type FeatureValue } from './feature-macros';
import { readGitInfo } from './git-info';
import { keysByEnum, parseKeysH, type KeywordEntry } from './keys-h';
import { buildSystemModules, MODULE_CONFIG, parseModuleConfig } from './system-modules';
import type { SystemModulesFile } from '@ohjs/schemas';

export const GENERATOR = '@ohjs/schema-extractor 0.1.0';

export interface SourceSet {
  ohVersion: string;
  provisional: boolean;
  provisionalReason?: string;
  target: string;
  /** arkui_ace_engine_lite checkout */
  engine: string;
  /** developtools_ace_js2bundle checkout */
  loader: string;
  /** docs checkout */
  docs: string;
  /** third_party/jerryscript checkout (js-capabilities.json); optional */
  jerryscript?: string;
}

export const PATHS = {
  keysH: 'frameworks/src/core/base/keys.h',
  factory: 'frameworks/src/core/components/component_factory.h',
  componentsDir: 'frameworks/src/core/components',
  srcDir: 'frameworks/src',
  config: (target: string): string => `frameworks/targets/${target}/acelite_config.h`,
  liteEnum: 'ace-loader/src/lite/lite-enum.js',
  docsDir: 'zh-cn/application-dev/reference/apis-arkui/arkui-js-lite',
} as const;

/** Framework-level attributes handled by the JS framework / ace-loader, not by Component::SetCommonAttribute. */
export const FRAMEWORK_ATTRIBUTES = ['id', 'class', 'style', 'ref'] as const;
/** Directives the hml syntax docs describe in prose (not in a table). */
export const PROSE_DIRECTIVES = ['elif', 'else', 'tid'] as const;

type Kind = 'attributes' | 'styles' | 'events' | 'methods';

export function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function listFiles(dir: string, re: RegExp): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'test' && e.name !== 'unittest') walk(p);
      } else if (re.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

class Ctx {
  readonly warnings: string[] = [];
  constructor(
    readonly set: SourceSet,
    readonly features: Record<string, { value: FeatureValue; line: number; dependsOn?: string[] }>,
    readonly keys: Map<string, KeywordEntry>,
  ) {}

  availabilityOf(feature: string | undefined, documented: boolean): Availability {
    if (feature) {
      const f = this.features[feature];
      if (!f)
        this.warnings.push(
          `feature macro ${feature} not defined for target ${this.set.target}; treated as disabled`,
        );
      if (!f || f.value === false) return 'disabled-by-feature';
      if (f.value === 'conditional') return 'conditional';
    }
    return documented ? 'code' : 'code-doc-missing';
  }
}

function ev(repo: string, file: string, line: number): Evidence {
  return { repo, file, line };
}

function docEvidence(e: DocEntry): Evidence {
  return ev('docs', `${PATHS.docsDir}/${e.file}`, e.line);
}

function keyName(kind: Kind, k: KeywordEntry): string {
  return kind === 'styles' ? camelToKebab(k.key) : k.key;
}

/** Merges implementation facts with doc entries for one kind. */
function mergeKind(
  ctx: Ctx,
  kind: Kind,
  facts: Array<ImplFact | MethodFact>,
  docs: DocEntry[],
  exclude: ReadonlySet<string>,
  inherited?: string,
): { fields: Record<string, FieldSchema>; docOnly: string[] } {
  const docByName = new Map(docs.map((d) => [d.name, d]));
  const fields: Record<string, FieldSchema> = {};
  for (const f of facts) {
    let name: string;
    let feature = f.feature;
    if ('enumName' in f) {
      const k = ctx.keys.get(f.enumName);
      if (!k) {
        ctx.warnings.push(`${f.evidence.file}:${f.evidence.line}: ${f.enumName} not found in keys.h`);
        continue;
      }
      name = keyName(kind, k);
      feature = feature ?? k.feature;
    } else name = f.name;
    feature = feature ?? inherited;
    const evidence = [ev('engine', f.evidence.file, f.evidence.line)];
    const existing = fields[name];
    if (existing) {
      existing.evidence.push(...evidence);
      continue;
    }
    const d = docByName.get(name);
    const field: FieldSchema = { availability: ctx.availabilityOf(feature, !!d), evidence };
    if (feature) field.feature = feature;
    if (d) {
      if (d.since) field.since = d.since;
      if (d.doc) field.doc = d.doc;
      field.evidence.push(docEvidence(d));
    }
    fields[name] = field;
  }
  const docOnly = docs.map((d) => d.name).filter((n) => !fields[n] && !exclude.has(n));
  return { fields, docOnly: [...new Set(docOnly)].sort() };
}

function sortRecord<T>(r: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function readRel(root: string, rel: string): string {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`missing source file ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function sourceInfo(repo: string, dir: string): SourceInfo {
  const g = readGitInfo(dir);
  return {
    repo,
    path: path.basename(dir),
    tags: g.tags,
    ...(g.commit ? { commit: g.commit } : {}),
    ...(g.remote ? { remote: g.remote } : {}),
  };
}

/** Runs the full extraction pipeline (ARCHITECTURE §7.4) for one source set. */
export function generateSchema(set: SourceSet): ComponentsSchemaFile {
  return annotateValues(buildSchema(set));
}

function buildSchema(set: SourceSet): ComponentsSchemaFile {
  const keysText = readRel(set.engine, PATHS.keysH);
  const keys = keysByEnum(parseKeysH(keysText));
  const features = featureSwitches(parseAceliteConfig(readRel(set.engine, PATHS.config(set.target))));
  const ctx = new Ctx(set, features, keys);

  // index engine sources
  const srcFiles = listFiles(path.join(set.engine, PATHS.srcDir), /\.(cpp|h)$/);
  const byName = new Map<string, string>();
  /** underscore-insensitive lookup: InputEditTextComponent → input_edittext_component.cpp */
  const byLoose = new Map<string, string>();
  const constants = new Map<string, string>();
  for (const f of srcFiles) {
    byName.set(path.basename(f), f);
    byLoose.set(path.basename(f).replace(/_/g, ''), f);
    for (const [k, v] of stringConstants(stripComments(fs.readFileSync(f, 'utf8'))))
      if (!constants.has(k)) constants.set(k, v);
  }
  const rel = (abs: string): string => path.relative(set.engine, abs).split(path.sep).join('/');
  const sourceOf = (abs: string): SourceFile => ({ rel: rel(abs), text: fs.readFileSync(abs, 'utf8') });

  /** class chain up to (excluding) Component */
  const classChain = (cls: string): Array<{ cls: string; cpp?: string }> => {
    const chain: Array<{ cls: string; cpp?: string }> = [];
    let cur: string | undefined = cls;
    const seen = new Set<string>();
    while (cur && cur !== 'Component' && !seen.has(cur)) {
      seen.add(cur);
      const stem = classToFileStem(cur);
      const cpp = byName.get(`${stem}.cpp`) ?? byLoose.get(`${stem.replace(/_/g, '')}.cpp`);
      const h = byName.get(`${stem}.h`) ?? byLoose.get(`${stem.replace(/_/g, '')}.h`);
      chain.push({ cls: cur, ...(cpp ? { cpp } : {}) });
      if (!cpp) ctx.warnings.push(`implementation of ${cur} (${stem}.cpp) not found`);
      cur = h ? baseClassOf(fs.readFileSync(h, 'utf8'), cur) : undefined;
    }
    return chain;
  };

  // docs
  const docsDir = path.join(set.docs, PATHS.docsDir);
  const pages = new Map<string, DocPage>();
  for (const f of fs.readdirSync(docsDir).sort()) {
    const t = docFileToTag(f);
    if (!t) continue;
    pages.set(t.tag, parseDocPage(fs.readFileSync(path.join(docsDir, f), 'utf8'), f, t.tag, t.category));
  }
  const commonPage = (file: string, def?: DocSection): DocPage | undefined => {
    const p = path.join(docsDir, file);
    return fs.existsSync(p) ? parseDocPage(fs.readFileSync(p, 'utf8'), file, '*', 'common', def) : undefined;
  };
  const cAttrs = commonPage('js-lite-common-attributes.md');
  const cStyles = commonPage('js-lite-common-styles.md', 'styles');
  const cEvents = commonPage('js-lite-common-events.md', 'events');
  const cAnim = commonPage('js-lite-components-common-animation.md', 'styles');
  const hmlPath = path.join(docsDir, 'js-lite-framework-syntax-hml.md');
  const hml = fs.existsSync(hmlPath) ? fs.readFileSync(hmlPath, 'utf8') : '';

  // common (Component base class)
  const componentCpp = byName.get('component.cpp');
  if (!componentCpp) throw new Error('component.cpp not found');
  const commonScan = scanComponentImpl('Component', sourceOf(componentCpp), constants, COMMON);
  ctx.warnings.push(...commonScan.warnings);
  const none = new Set<string>();
  const ca = mergeKind(
    ctx,
    'attributes',
    commonScan.attributes,
    [...(cAttrs?.sections.attributes ?? []), ...(cAttrs?.sections.directives ?? [])],
    none,
  );
  for (const n of FRAMEWORK_ATTRIBUTES) {
    if (ca.fields[n]) continue;
    const d = cAttrs?.sections.attributes?.find((e) => e.name === n);
    ca.fields[n] = {
      availability: 'framework',
      evidence: d && cAttrs ? [docEvidence(d)] : [],
      ...(d?.doc ? { doc: d.doc } : {}),
    };
  }
  for (const n of ca.docOnly)
    if (!ca.fields[n] && !cAttrs?.sections.directives?.some((d) => d.name === n))
      ctx.warnings.push(`common attribute "${n}" documented but not implemented`);
  const cs = mergeKind(
    ctx,
    'styles',
    commonScan.styles,
    [...(cStyles?.sections.styles ?? []), ...(cAnim?.sections.styles ?? [])],
    none,
  );
  for (const n of cs.docOnly)
    if (n !== 'transform') ctx.warnings.push(`common style "${n}" documented but not implemented`);
  const ce = mergeKind(ctx, 'events', commonScan.events, cEvents?.sections.events ?? [], none);
  for (const n of ce.docOnly) ctx.warnings.push(`common event "${n}" documented but not implemented`);
  const directives: Record<string, FieldSchema> = {};
  for (const d of cAttrs?.sections.directives ?? []) {
    directives[d.name] = {
      availability: 'framework',
      evidence: [docEvidence(d)],
      ...(d.doc ? { doc: d.doc } : {}),
    };
  }
  for (const n of PROSE_DIRECTIVES) {
    const idx = hml.split('\n').findIndex((l) => new RegExp(`\\b${n}\\s*=`).test(l));
    if (idx >= 0 && !directives[n]) {
      directives[n] = {
        availability: 'framework',
        evidence: [ev('docs', `${PATHS.docsDir}/js-lite-framework-syntax-hml.md`, idx + 1)],
      };
    }
  }
  const commonNames = {
    attributes: new Set(Object.keys(ca.fields).concat(Object.keys(directives))),
    styles: new Set(Object.keys(cs.fields)),
    events: new Set(Object.keys(ce.fields)),
    methods: new Set<string>(),
  };

  // components
  const components: Record<string, ComponentSchema> = {};
  for (const reg of parseComponentFactory(readRel(set.engine, PATHS.factory))) {
    const k = keys.get(reg.tagEnum);
    if (!k) {
      ctx.warnings.push(`factory tag ${reg.tagEnum} not in keys.h`);
      continue;
    }
    const tag = k.key;
    const page = pages.get(tag);
    const feature = reg.feature ?? k.feature;
    const facts: Record<Kind, Array<ImplFact | MethodFact>> = {
      attributes: [],
      styles: [],
      events: [],
      methods: [],
    };
    const implClasses: string[] = [];
    const variants: VariantSchema[] = [];
    const typeEvidence: Evidence[] = [];
    for (const v of reg.variants) {
      const vf = v.feature ?? feature;
      const typeValues = v.typeKeys.map((t) => keys.get(t)?.key ?? t);
      variants.push({
        implClass: v.implClass,
        typeValues,
        availability: ctx.availabilityOf(vf, true),
        ...(v.feature ? { feature: v.feature } : {}),
      });
      if (typeValues.length) typeEvidence.push(ev('engine', PATHS.factory, v.line));
      for (const { cls, cpp } of classChain(v.implClass)) {
        if (!implClasses.includes(cls)) implClasses.push(cls);
        if (!cpp) continue;
        const scan = scanComponentImpl(cls, sourceOf(cpp), constants);
        ctx.warnings.push(...scan.warnings);
        const tagFeature = (f: ImplFact | MethodFact): ImplFact | MethodFact =>
          v.feature && !f.feature ? { ...f, feature: v.feature } : f;
        facts.attributes.push(...scan.attributes.map(tagFeature));
        facts.styles.push(...scan.styles.map(tagFeature));
        facts.events.push(...scan.events.map(tagFeature));
        facts.methods.push(...scan.methods.map(tagFeature));
      }
    }
    const merged = {} as Record<Kind, { fields: Record<string, FieldSchema>; docOnly: string[] }>;
    for (const kind of ['attributes', 'styles', 'events', 'methods'] as const) {
      merged[kind] = mergeKind(
        ctx,
        kind,
        facts[kind],
        page?.sections[kind] ?? [],
        commonNames[kind],
        feature,
      );
      // a documented common name re-listed by a component page is not doc-only
    }
    if (typeEvidence.length && !merged.attributes.fields['type']) {
      const d = page?.sections.attributes?.find((e) => e.name === 'type');
      merged.attributes.fields['type'] = {
        availability: ctx.availabilityOf(feature, !!d),
        evidence: [...typeEvidence, ...(d && page ? [docEvidence(d)] : [])],
        ...(d?.doc ? { doc: d.doc } : {}),
        ...(feature ? { feature } : {}),
      };
      merged.attributes.docOnly = merged.attributes.docOnly.filter((n) => n !== 'type');
    }
    const comp: ComponentSchema = {
      tag,
      category: page?.category ?? 'runtime-extension',
      availability: ctx.availabilityOf(feature, !!page),
      implClasses,
      variants,
      attributes: sortRecord(merged.attributes.fields),
      styles: sortRecord(merged.styles.fields),
      events: sortRecord(merged.events.fields),
      methods: sortRecord(merged.methods.fields),
      docOnly: {
        attributes: merged.attributes.docOnly,
        styles: merged.styles.docOnly,
        events: merged.events.docOnly,
        methods: merged.methods.docOnly,
      },
      evidence: [
        ev('engine', PATHS.factory, reg.line),
        ev('engine', PATHS.keysH, k.line),
        ...(page ? [ev('docs', `${PATHS.docsDir}/${page.file}`, 1)] : []),
      ],
    };
    if (feature) comp.feature = feature;
    if (page?.since) comp.since = page.since;
    if (page?.children) comp.children = page.children;
    if (!page) ctx.warnings.push(`component <${tag}> is implemented but has no documentation page`);
    components[tag] = comp;
  }
  for (const tag of pages.keys()) {
    if (!components[tag])
      ctx.warnings.push(`component <${tag}> is documented but not created by ComponentFactory`);
  }

  const rules = extractLiteEnum(readRel(set.loader, PATHS.liteEnum));
  return {
    schemaFormat: 1,
    ohVersion: set.ohVersion,
    provisional: set.provisional,
    ...(set.provisionalReason ? { provisionalReason: set.provisionalReason } : {}),
    target: set.target,
    generator: GENERATOR,
    sources: [
      sourceInfo('engine', set.engine),
      sourceInfo('loader', set.loader),
      sourceInfo('docs', set.docs),
    ],
    features: sortRecord(
      Object.fromEntries(
        Object.entries(features).map(([n, f]) => [
          n,
          { value: f.value, ...(f.dependsOn ? { dependsOn: f.dependsOn } : {}) },
        ]),
      ),
    ),
    components: sortRecord(components),
    common: {
      attributes: sortRecord(ca.fields),
      styles: sortRecord(cs.fields),
      events: sortRecord(ce.fields),
      directives: sortRecord(directives),
    },
    aceLoader: {
      imageExtensions: imageExtensions(rules),
      specialStyles: rules.specialStyles,
      regexps: rules.regexps,
    },
    warnings: [...new Set(ctx.warnings)].sort(),
  };
}

/** `<version>/system-modules.json` from module_manager/ohos_module_config.h + targets/<target>/acelite_config.h. */
export function generateSystemModules(set: SourceSet): SystemModulesFile {
  const features = featureSwitches(parseAceliteConfig(readRel(set.engine, PATHS.config(set.target))));
  return buildSystemModules(parseModuleConfig(readRel(set.engine, MODULE_CONFIG)), features, {
    ohVersion: set.ohVersion,
    target: set.target,
    generator: GENERATOR,
  });
}
