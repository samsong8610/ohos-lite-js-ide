/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
export { generateSchema, type SourceSet } from './generate';
export { diffSchemas, renderDiffMarkdown, type SchemaDiff } from './diff';
export { parseSourcesConfig, expandVars } from './config';
export { runGenerate, runCheck, buildOutputs } from './run';
