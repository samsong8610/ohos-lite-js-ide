/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LogCapturePaths {
  tmpDir: string;
  captureFile: string;
  pidFile: string;
}

export function defaultLogCapturePaths(tmpDir: string): LogCapturePaths {
  return {
    tmpDir,
    captureFile: `${tmpDir}/hilog.cap`,
    pidFile: `${tmpDir}/hilogcat.pid`,
  };
}

/** Starts background hilogcat on the device (pid file lifecycle). */
export function shellStartLogCapture(paths: LogCapturePaths): string {
  const { tmpDir, captureFile, pidFile } = paths;
  return `mkdir -p ${tmpDir}; hilogcat > ${captureFile} & echo $! > ${pidFile}`;
}

/** Stops the background hilogcat started with {@link shellStartLogCapture}. */
export function shellStopLogCapture(paths: Pick<LogCapturePaths, 'pidFile'>): string {
  return `kill $(cat ${paths.pidFile}) 2>/dev/null; rm -f ${paths.pidFile}`;
}

/** Follow the capture file for live host-side streaming (after start). */
export function shellTailLogCapture(captureFile: string): string {
  return `tail -F ${captureFile}`;
}
