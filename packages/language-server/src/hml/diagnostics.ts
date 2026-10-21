/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { checkImagePath } from '../project/images';
import { checkExpressionEs5 } from '../js/es5';
import { interpolations, translationRefs } from '../project/i18n';
import { LineIndex } from '../text';
import { classifyAttribute, EVENT_MODIFIERS } from './attribute-names';
import { walk, type HmlDocument, type Range } from './parser';
import { isSuppressed, parseSuppressions, resolveSeverity, type HmlRuleId, type RuleSeverity } from './rules';
import type { SchemaView } from './schema-view';

export interface HmlDiagnostic {
  rule: HmlRuleId;
  severity: Exclude<RuleSeverity, 'off'>;
  message: string;
  range: Range;
}

export interface HmlProjectContext {
  /** this page's path, e.g. `pages/index/index` (undefined for non-page HML such as components) */
  page?: string;
  /** pages registered for this js module in config.json; undefined when config.json is unavailable */
  registeredPages?: readonly string[];
  /** locale file name (e.g. `en-US.json`) → leaf keys; undefined when not checked */
  i18n?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface HmlDiagnosticOptions {
  /** `ohjs.lang.rules` overrides: rule ID → severity or 'off' */
  rules?: Readonly<Record<string, unknown>>;
  /** cross-file facts (config.json, i18n) — FR-LANG-008 */
  project?: HmlProjectContext;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Components that exist only in the full (rich-device) JS UI framework; better message than "unknown". */
export const FULL_ONLY_COMPONENTS = new Set([
  'button',
  'dialog',
  'menu',
  'option',
  'select',
  'span',
  'textarea',
  'toolbar',
  'search',
  'rating',
  'refresh',
  'toggle',
  'badge',
  'popup',
  'panel',
  'stepper',
  'tab-bar',
  'tab-content',
  'tabs',
  'web',
  'form',
  'label',
  'divider',
  'piece',
  'picker',
  'grid-container',
  'grid-row',
  'grid-col',
  'list-item-group',
  'navigation-bar',
]);

const severityOrder = (s: string): s is Exclude<RuleSeverity, 'off'> => s !== 'off';

/** Validates an HML document against the active component schema (FR-LANG-006, HML subset). */
export function validateHml(
  doc: HmlDocument,
  view: SchemaView,
  options: HmlDiagnosticOptions = {},
): HmlDiagnostic[] {
  const lines = new LineIndex(doc.text);
  const suppress = parseSuppressions(
    doc.comments.map((c) => ({ text: c.text, endLine: lines.lineOf(c.range.end) })),
  );
  const out: HmlDiagnostic[] = [];
  const report = (rule: HmlRuleId, range: Range, message: string): void => {
    const severity = resolveSeverity(rule, options.rules);
    if (!severityOrder(severity)) return;
    if (isSuppressed(suppress, rule, lines.lineOf(range.start))) return;
    out.push({ rule, severity, message, range });
  };

  for (const p of doc.problems) report('hml/syntax', p.range, p.message);

  for (const el of walk(doc.roots)) {
    const comp = view.component(el.tag);
    if (!comp) {
      const extra = FULL_ONLY_COMPONENTS.has(el.tag)
        ? ' (it exists only in the full JS UI framework, not in ArkUI.Lite)'
        : '';
      report(
        'hml/unknown-component',
        el.nameRange,
        `Unknown component <${el.tag}> for OpenHarmony ${view.schema.ohVersion}${extra}`,
      );
    } else if (comp.availability === 'conditional' || comp.availability === 'code-doc-missing') {
      report(
        'hml/conditional-component',
        el.nameRange,
        comp.availability === 'conditional'
          ? `<${el.tag}> is only available when the firmware is built with ${comp.feature ?? 'an optional build flag'}; check the device's build`
          : `<${el.tag}> is registered by the engine but not documented for OpenHarmony ${view.schema.ohVersion}; behaviour may change`,
      );
    } else if (comp.availability === 'disabled-by-feature') {
      report(
        'hml/component-disabled-by-feature',
        el.nameRange,
        `<${el.tag}> is compiled out for target ${view.schema.target}${comp.feature ? ` (${comp.feature} is off)` : ''}`,
      );
    }
    const parent = el.parent;
    if (parent && comp && view.component(parent.tag) && !view.allowsChild(parent.tag, el.tag)) {
      const c = view.component(parent.tag)!.children;
      const hint =
        c === 'none'
          ? 'it does not accept child components'
          : Array.isArray(c)
            ? `only ${c.map((t) => `<${t}>`).join(', ')} allowed`
            : `<${el.tag}> is excluded`;
      report('hml/invalid-child', el.nameRange, `<${el.tag}> is not allowed inside <${parent.tag}>: ${hint}`);
    }
    // <image src> only: <video src> is a media file
    for (const a of el.tag === 'image' ? el.attributes : []) {
      if (a.name !== 'src' || a.value === undefined || !a.valueRange) continue;
      const f = checkImagePath(a.value, a.valueRange, view.schema.aceLoader.imageExtensions);
      if (f) report(f.rule, f.range, f.message);
    }
    const names = new Set(el.attributes.map((a) => a.name));
    if (names.has('for') && names.has('if')) {
      const a = el.attributes.find((x) => x.name === 'if')!;
      report(
        'hml/for-with-if',
        a.nameRange,
        '"for" and "if" on the same element: wrap the element in a <div> for the condition or filter the list',
      );
    }
    if (!comp) continue;
    for (const attr of el.attributes) {
      const plain = view.attribute(el.tag, attr.name);
      if (plain) {
        if (plain.field.availability === 'disabled-by-feature') {
          report(
            'hml/attribute-disabled-by-feature',
            attr.nameRange,
            `Attribute "${attr.name}" of <${el.tag}> is compiled out${plain.field.feature ? ` (${plain.field.feature} is off)` : ''}`,
          );
        }
        continue;
      }
      const k = classifyAttribute(attr.name);
      if (k.kind === 'event') {
        const ev = view.event(el.tag, k.event);
        if (!ev) {
          if (view.docOnlyEvents(el.tag).includes(k.event)) {
            report(
              'hml/doc-only-event',
              attr.nameRange,
              `Event "${k.event}" of <${el.tag}> is documented but not found in the engine implementation`,
            );
          } else report('hml/unknown-event', attr.nameRange, `Unknown event "${k.event}" for <${el.tag}>`);
        } else if (ev.field.availability === 'disabled-by-feature') {
          report(
            'hml/attribute-disabled-by-feature',
            attr.nameRange,
            `Event "${k.event}" of <${el.tag}> is compiled out${ev.field.feature ? ` (${ev.field.feature} is off)` : ''}`,
          );
        }
        for (const m of k.modifiers) {
          if (!(EVENT_MODIFIERS as readonly string[]).includes(m))
            report(
              'hml/unknown-event-modifier',
              attr.nameRange,
              `Unknown event modifier ".${m}" (supported: .bubble)`,
            );
        }
        if (!attr.value || !attr.value.trim())
          report('hml/empty-event-handler', attr.nameRange, `Event binding "${attr.name}" has no handler`);
        continue;
      }
      if (view.docOnlyAttributes(el.tag).includes(attr.name)) {
        report(
          'hml/doc-only-attribute',
          attr.nameRange,
          `Attribute "${attr.name}" of <${el.tag}> is documented but not found in the engine implementation`,
        );
      } else
        report('hml/unknown-attribute', attr.nameRange, `Unknown attribute "${attr.name}" for <${el.tag}>`);
    }
  }

  for (const ip of interpolations(doc)) {
    for (const f of checkExpressionEs5(ip.expr))
      report(
        'hml/es6-in-expression',
        { start: ip.start + f.start, end: ip.start + f.end },
        `${capitalize(f.feature)} (ES2015+) cannot be used in expressions: the engine runs ES5.1`,
      );
  }

  const p = options.project;
  if (p?.page && p.registeredPages && !p.registeredPages.includes(p.page)) {
    report(
      'prj/page-not-registered',
      doc.roots[0]?.nameRange ?? { start: 0, end: 0 },
      `Page "${p.page}" is not listed in config.json module.js[].pages, so it can never be shown`,
    );
  }
  if (p?.i18n) {
    const locales = [...p.i18n.keys()];
    for (const ref of translationRefs(doc)) {
      const missing = locales.filter((l) => !p.i18n!.get(l)!.has(ref.key));
      if (!locales.length)
        report('i18n/missing-key', ref.range, `$t('${ref.key}'): no i18n/*.json file found`);
      else if (missing.length === locales.length)
        report(
          'i18n/missing-key',
          ref.range,
          `$t('${ref.key}'): key not defined in ${locales.map((l) => `i18n/${l}`).join(', ')}`,
        );
      else if (missing.length)
        report(
          'i18n/missing-translation',
          ref.range,
          `$t('${ref.key}'): missing in ${missing.map((l) => `i18n/${l}`).join(', ')}`,
        );
    }
  }
  return out;
}
