/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BuildBackendKind, BuildIntentOptions } from './build-service-types';

function trimmed(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/** User configured paths or backend that require ace-loader + gold pack (no silent fixture fallback). */
export function requiresAceLoaderGoldPack(opts: {
  backend?: BuildBackendKind;
  aceLoaderPath?: string;
  aceLoaderMain?: string;
  restoolPath?: string;
}): boolean {
  if (opts.backend === 'fixture') return false;
  if (opts.backend === 'ace-loader') return true;
  if (trimmed(opts.aceLoaderPath)) return true;
  if (trimmed(opts.aceLoaderMain)) return true;
  if (trimmed(opts.restoolPath)) return true;
  if (trimmed(process.env.OHJS_ACE_LOADER_ROOT)) return true;
  if (trimmed(process.env.OHJS_ACE_LOADER_MAIN)) return true;
  return false;
}

export function buildIntentFromOptions(opts: BuildIntentOptions): {
  requiresAceLoaderGoldPack: boolean;
} {
  return {
    requiresAceLoaderGoldPack: requiresAceLoaderGoldPack(opts),
  };
}
