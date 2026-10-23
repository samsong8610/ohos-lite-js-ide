/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Activation-time budget for the integration smoke test: NFR-PERF-001 is 500 ms locally;
 * CI Linux/macOS 1000 ms; CI Windows 2000 ms (GitHub-hosted runners). Explicit
 * OHJS_ACTIVATION_BUDGET_MS wins.
 */
export function activationBudgetMs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.OHJS_ACTIVATION_BUDGET_MS) return env.OHJS_ACTIVATION_BUDGET_MS;
  if (env.CI !== 'true') return '500';
  return platform === 'win32' ? '2000' : '1000';
}
