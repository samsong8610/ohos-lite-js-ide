/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ohjs/core': r('./packages/core/src/index.ts'),
      '@ohjs/transport-hdc': r('./packages/transport-hdc/src/index.ts'),
      '@ohjs/schemas': r('./packages/schemas/src/index.ts'),
      '@ohjs/language-server/out': r('./packages/language-server/src'),
      '@ohjs/language-server': r('./packages/language-server/src/index.ts'),
      '@ohjs/jerry-debug-client': r('./packages/jerry-debug-client/src/index.ts'),
      '@ohjs/test-kit': r('./packages/test-kit/src/index.ts'),
      '@ohjs/build': r('./packages/build/src/index.ts'),
      '@ohjs/debug-adapter': r('./packages/debug-adapter/src/index.ts'),
      '@ohjs/schema-extractor': r('./tools/schema-extractor/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/extension/test/integration/*.test.ts',
      'packages/*/test/unit/**/*.test.ts',
      'tools/*/src/**/*.test.ts',
      'tools/*/test/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'lcov', 'cobertura'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts', 'tools/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        // vscode-dependent entry points are covered by @vscode/test-electron, not unit tests
        'packages/extension/src/extension.ts',
        // pure type declarations
        'packages/core/src/ports/**',
        // CLI wrapper (argv parsing + process exit), logic lives in testable modules
        'tools/schema-extractor/src/cli.ts',
        // language server process entry (createConnection on stdio/ipc); covered by the extension smoke test
        'packages/language-server/src/main.ts',
        'packages/extension/src/language-client.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
        // NFR-TST-002 / PLAN §3: hdc output parsing, schema extraction & validation >= 90%
        'packages/transport-hdc/src/parser/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        'tools/schema-extractor/src/**': { lines: 90, statements: 90, functions: 90 },
        'packages/schemas/src/**': { lines: 90, statements: 90, functions: 90 },
        // HML parsing / LSP protocol handling (M1-7)
        'packages/language-server/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
