/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
export * from './protocol';
export { startServer, SERVER_NAME } from './server';
export {
  OhjsLanguageService,
  documentKind,
  companionUri,
  DIAGNOSTIC_SOURCE,
  type ServiceSettings,
  type FileReader,
} from './service';
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
export { RULES, HML_RULES, type RuleId, type HmlRuleId } from './hml/rules';
export { extractViewModel, LIFECYCLE_HOOKS, type ViewModelSymbols } from './js/viewmodel';
export { parseCss, selectorTargets, type CssDocument, type CssRule } from './css/parser';
export { validateCss, completeCss, matchedTags } from './css/css-features';
export { checkEs5, checkExpressionEs5, findEs6, type Es6Finding, type Es6Tier } from './js/es5';
export {
  findUnsupportedBuiltins,
  SUPPORTED_ES2015_BUILTINS,
  UNSUPPORTED_BUILTINS,
  type BuiltinEntry,
} from './js/builtins';
export { validateConfig, readConfig, REQUIRED_DEVICE_TYPE, HOME_PAGE } from './project/config';
export { i18nKeys, interpolations, translationRefs } from './project/i18n';
export { moduleLayout, type ModuleLayout } from './project/layout';
export { checkSystemModules } from './js/system-modules';
export {
  completeThis,
  PAGE_LIFECYCLE,
  APP_LIFECYCLE,
  FRAMEWORK_MEMBERS,
  type ThisCompletion,
} from './js/this-completion';
export * from './types-gen/index';
