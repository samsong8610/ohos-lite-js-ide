/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Platform abstraction rules (ARCHITECTURE §1.2, NFR-PLT-004):
 * business code must not spawn processes or branch on the host OS directly.
 * Only packages/core/src/platform/** and test infrastructure are exempt.
 */
const PLATFORM_MSG = 'Use IPlatform / IProcessRunner from @ohjs/core (NFR-PLT-004).';
export const platformRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        { name: 'child_process', message: PLATFORM_MSG },
        { name: 'node:child_process', message: PLATFORM_MSG },
        { name: 'cluster', message: PLATFORM_MSG },
        { name: 'node:cluster', message: PLATFORM_MSG },
      ],
      patterns: [
        { group: ['execa', 'cross-spawn', 'shelljs'], message: PLATFORM_MSG },
        { group: ['path/win32', 'path/posix', 'node:path/win32', 'node:path/posix'], message: PLATFORM_MSG },
      ],
    },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'process', property: 'platform', message: PLATFORM_MSG },
    { object: 'os', property: 'platform', message: PLATFORM_MSG },
    { object: 'os', property: 'type', message: PLATFORM_MSG },
    { object: 'os', property: 'tmpdir', message: PLATFORM_MSG },
    { object: 'os', property: 'EOL', message: PLATFORM_MSG },
    { object: 'path', property: 'win32', message: PLATFORM_MSG },
    { object: 'path', property: 'posix', message: PLATFORM_MSG },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        'ImportDeclaration[source.value=/^(node:)?os$/] > ImportSpecifier[imported.name=/^(platform|type|release|tmpdir|EOL)$/]',
      message: PLATFORM_MSG,
    },
    {
      selector:
        'ImportDeclaration[source.value=/^(node:)?path$/] > ImportSpecifier[imported.name=/^(win32|posix)$/]',
      message: PLATFORM_MSG,
    },
  ],
  'no-restricted-globals': ['error', { name: 'require', message: 'Use ES imports.' }],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/out-test/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.vscode-test/**',
      '**/fixtures/**',
      'packages/schemas/v*/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      ...platformRestrictions,
    },
  },
  {
    // Sanctioned places that may touch processes / host OS.
    files: [
      'packages/core/src/platform/**',
      'packages/test-kit/**',
      'packages/extension/test/**',
      'scripts/**',
      '**/*.test.ts',
      '**/test/**',
      'vitest.config.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.cjs', 'packages/test-kit/mock-hdc/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { 'no-restricted-globals': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
