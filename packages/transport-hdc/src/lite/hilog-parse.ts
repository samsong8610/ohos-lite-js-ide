/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Parsed hilog / hilogcat line (lite small-system). */
export interface HilogEntry {
  raw: string;
  monthDay?: string;
  time?: string;
  pid?: string;
  taskId?: string;
  level?: string;
  domain?: string;
  tag?: string;
  message?: string;
}

const HILOG_LINE =
  /^(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^/]+)\/([^:]+):\s*(.*)$/;

/** Parses one line; returns `{ raw }` only when the pattern does not match. */
export function parseHilogLine(line: string): HilogEntry {
  const trimmed = line.replace(/\r$/, '');
  const m = HILOG_LINE.exec(trimmed);
  if (!m) return { raw: trimmed };
  return {
    raw: trimmed,
    monthDay: m[1],
    time: m[2],
    pid: m[3],
    taskId: m[4],
    level: m[5],
    domain: m[6],
    tag: m[7],
    message: m[8],
  };
}

export function formatHilogEntry(e: HilogEntry): string {
  if (e.time && e.level && e.domain && e.tag != null) {
    return `${e.monthDay ?? ''} ${e.time} ${e.pid ?? ''} ${e.taskId ?? ''} ${e.level} ${e.domain}/${e.tag}: ${e.message ?? ''}`.trim();
  }
  return e.raw;
}
