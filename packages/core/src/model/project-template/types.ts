/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
export type OhSdkVersion = '5.0.3' | '6.1-lts';

export interface TemplateManifest {
  id: string;
  displayName: string;
  description?: string;
  /** FA module folder name (default `entry`). */
  moduleName?: string;
}

export interface ProjectTemplateContext {
  bundleName: string;
  vendor: string;
  sdkVersion: OhSdkVersion;
  deviceProfileId: string;
  display: { width: number; height: number };
}

export interface RenderedProjectFile {
  /** Path relative to the generated project root, POSIX separators. */
  relativePath: string;
  content: Uint8Array;
}
