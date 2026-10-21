/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  type CompletionItem,
  type Diagnostic,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { completeCss, validateCss } from './css/css-features';
import { parseCss, type CssDocument } from './css/parser';
import { completeHml, type HmlCompletion } from './hml/completion';
import { validateHml, type HmlDiagnostic } from './hml/diagnostics';
import { parseHml, type HmlDocument } from './hml/parser';
import { SchemaView } from './hml/schema-view';
import { extractViewModel, type ViewModelSymbols } from './js/viewmodel';
import type { SchemaRegistry } from './schema-registry';

/** Reads sibling files (open editor buffer first, then disk). Returns undefined when absent. */
export interface FileReader {
  read(uri: string): string | undefined;
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
): 'hml' | 'css' | 'js' | undefined {
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
};

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

  validate(doc: TextDocument): Diagnostic[] {
    const kind = documentKind(doc);
    // selector rules apply to plain CSS; LESS/SCSS nesting (`&:active`, nested rules) is compiled away later
    if (kind === 'css' && doc.languageId !== 'less' && !/\.less$/i.test(doc.uri)) {
      return validateCss(this.css(doc), { rules: this.settings.rules }).map((d) => this.toDiagnostic(doc, d));
    }
    if (kind !== 'hml') return [];
    return validateHml(this.hml(doc), this.view, { rules: this.settings.rules }).map((d) =>
      this.toDiagnostic(doc, d),
    );
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
        kind: CompletionItemKind.Property,
        ...(c.detail ? { detail: c.detail } : {}),
        ...(c.documentation ? { documentation: { kind: 'markdown' as const, value: c.documentation } } : {}),
        textEdit: {
          range: { start: doc.positionAt(c.replace.start), end: doc.positionAt(c.replace.end) },
          newText: `${c.label}: `,
        },
      }));
    }
    if (kind !== 'hml') return [];
    return completeHml(this.hml(doc), offset, this.view, this.viewModel(doc.uri)).map((c) => ({
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
