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
import { completeHml, type HmlCompletion } from './hml/completion';
import { validateHml, type HmlDiagnostic } from './hml/diagnostics';
import { parseHml, type HmlDocument } from './hml/parser';
import { SchemaView } from './hml/schema-view';
import type { SchemaRegistry } from './schema-registry';

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
};

/**
 * Editor-independent language service: LSP types in, LSP types out. The LSP server is a thin wrapper
 * so this can be unit-tested without a connection (FR-LANG-012).
 */
export class OhjsLanguageService {
  private readonly parsed = new Map<string, { version: number; doc: HmlDocument }>();
  private view: SchemaView;

  constructor(
    readonly registry: SchemaRegistry,
    public settings: ServiceSettings = {},
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

  forget(uri: string): void {
    this.parsed.delete(uri);
  }

  validate(doc: TextDocument): Diagnostic[] {
    if (documentKind(doc) !== 'hml') return [];
    return validateHml(this.hml(doc), this.view, { rules: this.settings.rules }).map((d) => ({
      range: { start: doc.positionAt(d.range.start), end: doc.positionAt(d.range.end) },
      severity: SEVERITY[d.severity],
      source: DIAGNOSTIC_SOURCE,
      code: d.rule,
      message: d.message,
    }));
  }

  complete(doc: TextDocument, position: { line: number; character: number }): CompletionItem[] {
    if (documentKind(doc) !== 'hml') return [];
    const offset = doc.offsetAt(position);
    return completeHml(this.hml(doc), offset, this.view).map((c) => ({
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
