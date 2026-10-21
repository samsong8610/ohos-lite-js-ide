/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  DEFAULT_DATA_DIR,
  listSchemaVersions,
  loadComponentsSchema,
  versionDirName,
  type ComponentsSchemaFile,
} from '@ohjs/schemas';

export const DEFAULT_SDK_VERSION = '5.0.3';

/**
 * SchemaRegistry (ARCHITECTURE §7.1, §16.2): lazily loads and caches one data pack per SDK version and
 * holds the active one. Switching versions is a cheap pointer change after the first load (FR-LANG-012).
 */
export class SchemaRegistry {
  private readonly cache = new Map<string, ComponentsSchemaFile>();
  private activeVersion: string;

  constructor(
    private readonly dataDir: string = DEFAULT_DATA_DIR,
    version: string = DEFAULT_SDK_VERSION,
  ) {
    this.activeVersion = normalizeSdkVersion(version);
  }

  /** Available versions as directory-normalized names, e.g. ['5.0.3', '6.1-lts']. */
  versions(): string[] {
    return listSchemaVersions(this.dataDir).map((d) => d.slice(1));
  }

  get version(): string {
    return this.activeVersion;
  }

  /** Throws SchemaLoadError (and keeps the previous version) when the pack is missing or invalid. */
  setVersion(version: string): ComponentsSchemaFile {
    const v = normalizeSdkVersion(version);
    const schema = this.load(v);
    this.activeVersion = v;
    return schema;
  }

  get active(): ComponentsSchemaFile {
    return this.load(this.activeVersion);
  }

  private load(v: string): ComponentsSchemaFile {
    let s = this.cache.get(v);
    if (!s) {
      s = loadComponentsSchema(v, this.dataDir);
      this.cache.set(v, s);
    }
    return s;
  }
}

/** '6.1-LTS' / 'v6.1-lts' / ' 5.0.3 ' → '6.1-lts' / '5.0.3' */
export function normalizeSdkVersion(v: string): string {
  return versionDirName(v.trim()).slice(1);
}
