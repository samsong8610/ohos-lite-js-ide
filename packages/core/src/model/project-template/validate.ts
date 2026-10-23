/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/** FR-PRJ-001: reverse-DNS bundle name with at least three dot-separated segments. */
export const BUNDLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){2,}$/;

export interface BundleNameValidation {
  ok: boolean;
  message?: string;
}

export function validateBundleName(bundleName: string): BundleNameValidation {
  const trimmed = bundleName.trim();
  if (!trimmed) {
    return { ok: false, message: 'Bundle name is required (e.g. com.example.myapp).' };
  }
  if (!BUNDLE_NAME_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message:
        'Bundle name must start with a letter and contain at least three segments separated by dots (e.g. com.example.myapp). Only letters, digits, and underscores are allowed in each segment.',
    };
  }
  return { ok: true };
}
