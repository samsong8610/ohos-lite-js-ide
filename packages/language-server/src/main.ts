#!/usr/bin/env node
/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Entry point: `node server.js --stdio` or launched by vscode-languageclient over IPC (FR-LANG-012).
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { startServer } from './server';

startServer(createConnection(ProposedFeatures.all));
