/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** True when zip listing matches {@link runFixtureBuild} (copied `src/main` tree), not DevEco gold layout. */
export function isFixtureSourceTreeHapLayout(zipPaths: string[]): boolean {
  const hasSrcMain = zipPaths.some((p) => p.startsWith('src/main/'));
  const hasGoldRoot = zipPaths.includes('config.json') && zipPaths.includes('pack.info');
  const hasAssetsJs = zipPaths.some((p) => p.startsWith('assets/js/'));
  return hasSrcMain && !hasGoldRoot && !hasAssetsJs;
}

/** Minimal path set for DevEco gold HAP (see docs/GOLD-HAP-ACCEPTANCE.md). */
export function isGoldHapLayout(zipPaths: string[]): boolean {
  return (
    zipPaths.includes('config.json') &&
    zipPaths.includes('pack.info') &&
    zipPaths.some((p) => p.startsWith('assets/js/')) &&
    zipPaths.some((p) => p.includes('resources.index'))
  );
}
