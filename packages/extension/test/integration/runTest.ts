/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Smoke tests in a real VS Code instance (NFR-TST-001 integration layer, FR-PRJ-003 activation).
import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { createMockHdc } from '@ohjs/test-kit';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const fixtures = path.resolve(__dirname, '..', 'test', 'fixtures');
  const version = process.env.OHJS_VSCODE_VERSION ?? 'stable';
  const scenarios: Array<[string, string]> = [
    ['oh-project', 'active'],
    ['non-oh-project', 'inactive'],
  ];
  // mock-hdc stands in for the real hdc (CI only runs mocks, NFR-TST-001)
  const mock = createMockHdc({ targets: [{ key: '7001005458323933328a01ab', name: '2k0300' }] });
  for (const [folder, expectation] of scenarios) {
    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [path.join(fixtures, folder), '--disable-extensions', '--disable-workspace-trust'],
      extensionTestsEnv: {
        OHJS_EXPECT: expectation,
        OHJS_MOCK_HDC: mock.hdcPath,
        OHJS_ACTIVATION_BUDGET_MS: activationBudgetMs(),
        ...mock.env,
      },
    });
  }
  mock.dispose();
}

main().catch((err) => {
  console.error('integration tests failed:', err);
  process.exit(1);
});

/**
 * Activation-time budget for the integration test: NFR-PERF-001 is 500 ms (local and device runs);
 * shared CI runners (`CI=true`, set by GitHub Actions) get 1000 ms. An explicit
 * OHJS_ACTIVATION_BUDGET_MS wins.
 */
function activationBudgetMs(): string {
  if (process.env.OHJS_ACTIVATION_BUDGET_MS) return process.env.OHJS_ACTIVATION_BUDGET_MS;
  return process.env.CI === 'true' ? '1000' : '500';
}
