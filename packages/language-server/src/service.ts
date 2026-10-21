/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type Location,
  type Position,
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  type CompletionItem,
  type Diagnostic,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { completeCss, validateCss } from './css/css-features';
import { parseCss, type CssDocument } from './css/parser';
import { completeHml, type HmlCompletion } from './hml/completion';
import { validateHml, type HmlDiagnostic, type HmlProjectContext } from './hml/diagnostics';
import { parseHml, walk, type HmlDocument } from './hml/parser';
import { SchemaView } from './hml/schema-view';
import { checkEs5 } from './js/es5';
import { checkSystemModules } from './js/system-modules';
import { checkFeatureMethods, methodCalls } from './js/feature-methods';
import { completeThis } from './js/this-completion';
import { extractViewModel, type ViewModelSymbols } from './js/viewmodel';
import { readConfig, validateConfig } from './project/config';
import { i18nKeys, i18nKeyRange, translationRefs } from './project/i18n';
import { mainUriOfConfig, moduleLayout } from './project/layout';
import { isSuppressed, parseSuppressions, resolveSeverity, type RuleId } from './hml/rules';
import { LineIndex } from './text';
import type { SchemaRegistry } from './schema-registry';

/** Reads sibling files (open editor buffer first, then disk). Returns undefined when absent. */
export interface FileReader {
  read(uri: string): string | undefined;
  /** file names (not paths) directly inside a directory URI ending in '/'; undefined when absent */
  list?(dirUri: string): string[] | undefined;
}

/** index.hml → index.js / index.css: the page's "three-piece set" (ARCHITECTURE §7.1 ProjectIndex). */
export function companionUri(uri: string, ext: 'hml' | 'js' | 'css' | 'less'): string {
  return uri.replace(/\.[A-Za-z]+$/, `.${ext}`);
}

export const DIAGNOSTIC_SOURCE = 'ohjs';

export interface ServiceSettings {
  rules?: Record<string, unknown>;
}

/** Which language service handles a document: by languageId first, then by extension. */
export function documentKind(
  doc: Pick<TextDocument, 'languageId' | 'uri'>,
): 'hml' | 'css' | 'js' | 'config' | 'i18n' | undefined {
  if (/\/src\/main\/config\.json$/i.test(doc.uri)) return 'config';
  if (/\/src\/main\/js\/[^/]+\/i18n\/[^/]+\.json$/i.test(doc.uri)) return 'i18n';
  if (doc.languageId === 'hml' || /\.hml$/i.test(doc.uri)) return 'hml';
  if (doc.languageId === 'css' || doc.languageId === 'less' || /\.(css|less)$/i.test(doc.uri)) return 'css';
  if (doc.languageId === 'javascript' || /\.js$/i.test(doc.uri)) return 'js';
  return undefined;
}

const SEVERITY: Record<HmlDiagnostic['severity'], DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  information: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

const KIND: Record<HmlCompletion['kind'], CompletionItemKind> = {
  component: CompletionItemKind.Class,
  closeTag: CompletionItemKind.Property,
  attribute: CompletionItemKind.Property,
  directive: CompletionItemKind.Keyword,
  event: CompletionItemKind.Event,
  variable: CompletionItemKind.Variable,
  method: CompletionItemKind.Method,
  function: CompletionItemKind.Function,
  i18nKey: CompletionItemKind.Constant,
  enumValue: CompletionItemKind.EnumMember,
};

interface RuleFinding {
  rule: RuleId;
  message: string;
  range: { start: number; end: number };
}

/**
 * Editor-independent language service: LSP types in, LSP types out. The LSP server is a thin wrapper
 * so this can be unit-tested without a connection (FR-LANG-012).
 */
export class OhjsLanguageService {
  private readonly parsed = new Map<string, { version: number; doc: HmlDocument }>();
  private readonly cssParsed = new Map<string, { version: number; doc: CssDocument }>();
  private readonly vmCache = new Map<string, { text: string; vm: ViewModelSymbols }>();
  private view: SchemaView;

  constructor(
    readonly registry: SchemaRegistry,
    public settings: ServiceSettings = {},
    private readonly files: FileReader = { read: () => undefined },
  ) {
    this.view = new SchemaView(registry.active);
  }

  get sdkVersion(): string {
    return this.registry.version;
  }

  /** Switches the active schema (ohjs/sdkChanged). Throws and keeps the old schema when unavailable. */
  setSdkVersion(version: string): void {
    this.view = new SchemaView(this.registry.setVersion(version));
  }

  /** Parse cache keyed by document version (ARCHITECTURE §7.2 performance note). */
  private hml(doc: TextDocument): HmlDocument {
    const hit = this.parsed.get(doc.uri);
    if (hit && hit.version === doc.version) return hit.doc;
    const parsed = parseHml(doc.getText());
    this.parsed.set(doc.uri, { version: doc.version, doc: parsed });
    return parsed;
  }

  private css(doc: TextDocument): CssDocument {
    const hit = this.cssParsed.get(doc.uri);
    if (hit && hit.version === doc.version) return hit.doc;
    const parsed = parseCss(doc.getText());
    this.cssParsed.set(doc.uri, { version: doc.version, doc: parsed });
    return parsed;
  }

  /** ViewModel symbols of the page's same-name .js (re-extracted only when its text changes). */
  viewModel(hmlUri: string): ViewModelSymbols | undefined {
    const jsUri = companionUri(hmlUri, 'js');
    const text = this.files.read(jsUri);
    if (text === undefined) return undefined;
    const hit = this.vmCache.get(jsUri);
    if (hit && hit.text === text) return hit.vm;
    const vm = extractViewModel(text);
    this.vmCache.set(jsUri, { text, vm });
    return vm;
  }

  forget(uri: string): void {
    this.parsed.delete(uri);
    this.cssParsed.delete(uri);
  }

  /** locale file → leaf keys for the module of `hmlUri`; undefined outside an FA js tree */
  /** Go to definition: `$t('a.b')` in HML → the key in every i18n/<locale>.json defining it. */
  definition(doc: TextDocument, position: Position): Location[] {
    if (documentKind(doc) !== 'hml') return [];
    const offset = doc.offsetAt(position);
    const ref = translationRefs(this.hml(doc)).find((r) => r.range.start <= offset && offset <= r.range.end);
    const layout = moduleLayout(doc.uri);
    if (!ref || !layout || !this.files.list) return [];
    const out: Location[] = [];
    for (const name of (this.files.list(layout.i18nDirUri) ?? []).filter((n) => /\.json$/i.test(n)).sort()) {
      const uri = layout.i18nDirUri + name;
      const text = this.files.read(uri);
      const r = text === undefined ? undefined : i18nKeyRange(text, ref.key);
      if (!r) continue;
      const target = TextDocument.create(uri, 'json', 0, text!);
      out.push({ uri, range: { start: target.positionAt(r.start), end: target.positionAt(r.end) } });
    }
    return out;
  }

  i18n(hmlUri: string): Map<string, Set<string>> | undefined {
    const layout = moduleLayout(hmlUri);
    if (!layout || !this.files.list) return undefined;
    const map = new Map<string, Set<string>>();
    for (const name of (this.files.list(layout.i18nDirUri) ?? []).filter((n) => /\.json$/i.test(n)).sort()) {
      const text = this.files.read(layout.i18nDirUri + name);
      if (text !== undefined) map.set(name, i18nKeys(text));
    }
    return map;
  }

  validate(doc: TextDocument): Diagnostic[] {
    const kind = documentKind(doc);
    const rules = this.settings.rules;
    // selector rules apply to plain CSS; LESS/SCSS nesting (`&:active`, nested rules) is compiled away later
    if (kind === 'css' && doc.languageId !== 'less' && !/\.less$/i.test(doc.uri)) {
      return validateCss(this.css(doc), {
        rules,
        imageExtensions: this.view.schema.aceLoader.imageExtensions,
      }).map((d) => this.toDiagnostic(doc, d));
    }
    if (kind === 'js') {
      const r = checkEs5(doc.getText());
      const pack = this.registry.modules;
      return this.filtered(
        doc,
        [
          ...(pack ? checkSystemModules(r.modules, pack) : []),
          ...(r.ast ? checkFeatureMethods(methodCalls(r.ast), this.view.schema, this.refTags(doc.uri)) : []),
          ...r.findings.map((f) => ({
            rule: 'js/es6-syntax' as const,
            range: f,
            message: `${f.feature.charAt(0).toUpperCase()}${f.feature.slice(1)} (ES2015+) cannot be used: the engine runs ES5.1`,
          })),
        ].sort((a, b) => a.range.start - b.range.start),
        r.comments.map((c) => ({ text: c.text, end: c.end })),
      );
    }
    if (kind === 'config') {
      const main = mainUriOfConfig(doc.uri)!;
      const findings = validateConfig(
        doc.getText(),
        (jsName, page) => this.files.read(`${main}js/${jsName}/${page}.hml`) !== undefined,
        new Set(Object.keys(this.view.schema.components)),
      );
      return this.filtered(doc, findings, []);
    }
    if (kind !== 'hml') return [];
    const layout = moduleLayout(doc.uri);
    let project: HmlProjectContext | undefined;
    if (layout) {
      const configText = this.files.read(layout.configUri);
      const config = configText === undefined ? undefined : readConfig(configText);
      const registered = config?.pages.get(layout.jsName);
      const i18n = this.i18n(doc.uri);
      project = {
        ...(layout.page ? { page: layout.page } : {}),
        ...(registered ? { registeredPages: registered } : {}),
        ...(i18n ? { i18n } : {}),
      };
    }
    return validateHml(this.hml(doc), this.view, { rules, ...(project ? { project } : {}) }).map((d) =>
      this.toDiagnostic(doc, d),
    );
  }

  /** `ref="x"` → tag in the same-name .hml of a page script */
  private refTags(jsUri: string): Map<string, string> {
    const out = new Map<string, string>();
    const text = this.files.read(companionUri(jsUri, 'hml'));
    if (text === undefined) return out;
    for (const el of walk(parseHml(text).roots)) {
      const ref = el.attributes.find((a) => a.name === 'ref');
      if (ref?.value && !ref.value.includes('{{')) out.set(ref.value, el.tag);
    }
    return out;
  }

  /** severity overrides and `ohjs-disable` comments for the non-HML rule families */
  private filtered(
    doc: TextDocument,
    findings: RuleFinding[],
    comments: Array<{ text: string; end: number }>,
  ): Diagnostic[] {
    const text = doc.getText();
    const lines = new LineIndex(text);
    const sup = parseSuppressions(comments.map((c) => ({ text: c.text, endLine: lines.lineOf(c.end) })));
    const out: Diagnostic[] = [];
    for (const f of findings) {
      const severity = resolveSeverity(f.rule, this.settings.rules);
      if (severity === 'off' || isSuppressed(sup, f.rule, lines.lineOf(f.range.start))) continue;
      out.push(this.toDiagnostic(doc, { ...f, severity }));
    }
    return out;
  }

  private toDiagnostic(
    doc: TextDocument,
    d: {
      range: { start: number; end: number };
      severity: HmlDiagnostic['severity'];
      rule: string;
      message: string;
    },
  ): Diagnostic {
    return {
      range: { start: doc.positionAt(d.range.start), end: doc.positionAt(d.range.end) },
      severity: SEVERITY[d.severity],
      source: DIAGNOSTIC_SOURCE,
      code: d.rule,
      message: d.message,
    };
  }

  complete(doc: TextDocument, position: { line: number; character: number }): CompletionItem[] {
    const kind = documentKind(doc);
    const offset = doc.offsetAt(position);
    if (kind === 'css') {
      const hmlText = this.files.read(companionUri(doc.uri, 'hml'));
      const hml = hmlText === undefined ? undefined : parseHml(hmlText);
      return completeCss(this.css(doc), offset, this.view, hml).map((c) => ({
        label: c.label,
        kind: c.kind === 'value' ? CompletionItemKind.EnumMember : CompletionItemKind.Property,
        ...(c.detail ? { detail: c.detail } : {}),
        ...(c.documentation ? { documentation: { kind: 'markdown' as const, value: c.documentation } } : {}),
        textEdit: {
          range: { start: doc.positionAt(c.replace.start), end: doc.positionAt(c.replace.end) },
          newText: c.kind === 'value' ? c.label : `${c.label}: `,
        },
      }));
    }
    if (kind === 'js') {
      const text = doc.getText();
      return completeThis(text, offset, extractViewModel(text), /(^|\/)app\.js$/i.test(doc.uri)).map((c) => ({
        label: c.label,
        kind: {
          variable: CompletionItemKind.Variable,
          method: CompletionItemKind.Method,
          property: CompletionItemKind.Property,
          function: CompletionItemKind.Function,
        }[c.kind],
        detail: c.detail,
        sortText: c.sortText,
        ...(c.documentation ? { documentation: { kind: 'markdown' as const, value: c.documentation } } : {}),
        textEdit: {
          range: { start: doc.positionAt(c.replace.start), end: doc.positionAt(c.replace.end) },
          newText: c.label,
        },
      }));
    }
    if (kind !== 'hml') return [];
    const keys = new Set<string>();
    for (const set of this.i18n(doc.uri)?.values() ?? []) for (const k of set) keys.add(k);
    return completeHml(this.hml(doc), offset, this.view, this.viewModel(doc.uri), keys).map((c) => ({
      label: c.label,
      kind: KIND[c.kind],
      ...(c.detail ? { detail: c.detail } : {}),
      ...(c.documentation ? { documentation: { kind: 'markdown' as const, value: c.documentation } } : {}),
      ...(c.sortText ? { sortText: c.sortText } : {}),
      insertTextFormat: c.snippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
      textEdit: {
        range: { start: doc.positionAt(c.replace.start), end: doc.positionAt(c.replace.end) },
        newText: c.insertText,
      },
    }));
  }
}
