/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { findFailure, type HdcFailure } from './messages';

export interface FileTransferStats {
  sizeBytes: number;
  fileCount: number;
  timeMs: number;
  rateKBps: number;
}

/**
 * `hdc file send|recv` result.
 * Success line (common/file.cpp): "FileTransfer finish, Size:%lld, File count = %d, time:%lldms rate:%.2lfkB/s"
 */
export function parseFileTransfer(
  output: string,
): { ok: true; stats: FileTransferStats } | { ok: false; failure: HdcFailure } {
  const m = /FileTransfer finish, Size:(\d+), File count = (\d+), time:(\d+)ms rate:([\d.]+)kB\/s/.exec(
    output,
  );
  const failure = findFailure(output);
  if (m && !failure) {
    return {
      ok: true,
      stats: {
        sizeBytes: Number(m[1]),
        fileCount: Number(m[2]),
        timeMs: Number(m[3]),
        rateKBps: Number(m[4]),
      },
    };
  }
  return {
    ok: false,
    failure: failure ?? {
      code: 'TRN-HDC-FILE-TRANSFER',
      message: output.trim() || 'no FileTransfer result from hdc',
    },
  };
}
