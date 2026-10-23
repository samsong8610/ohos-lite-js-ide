/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
declare module 'yazl' {
  import type { Readable } from 'node:stream';

  export class ZipFile {
    addFile(realPath: string, metadataPath: string): void;
    end(): void;
    readonly outputStream: Readable;
  }
}
