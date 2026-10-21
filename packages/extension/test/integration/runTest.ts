/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// Smoke tests in a real VS Code instance (NFR-TST-001 integration layer, FR-PRJ-003 activation).
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const fixtures = path.resolve(__dirname, '..', 'test', 'fixtures');
  const version = process.env.OHJS_VSCODE_VERSION ?? 'stable';
  const scenarios: Array<[string, string]> = [
    ['oh-project', 'active'],
    ['non-oh-project', 'inactive'],
  ];
  for (const [folder, expectation] of scenarios) {
    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [path.join(fixtures, folder), '--disable-extensions', '--disable-workspace-trust'],
      extensionTestsEnv: { OHJS_EXPECT: expectation },
    });
  }
}

main().catch((err) => {
  console.error('integration tests failed:', err);
  process.exit(1);
});
