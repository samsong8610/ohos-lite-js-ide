/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
export * from './protocol';
export { startServer, SERVER_NAME } from './server';
export { OhjsLanguageService, documentKind, DIAGNOSTIC_SOURCE, type ServiceSettings } from './service';
export { SchemaRegistry, normalizeSdkVersion, DEFAULT_SDK_VERSION } from './schema-registry';
export {
  parseHml,
  walk,
  elementAt,
  type HmlDocument,
  type HmlElement,
  type HmlAttribute,
} from './hml/parser';
export { validateHml, FULL_ONLY_COMPONENTS, type HmlDiagnostic } from './hml/diagnostics';
export { completeHml, completionContext, type HmlCompletion } from './hml/completion';
export { SchemaView } from './hml/schema-view';
export { HML_RULES, type HmlRuleId } from './hml/rules';
