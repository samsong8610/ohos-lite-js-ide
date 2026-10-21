/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** 0-based line of an offset; '\r\n', '\n' and '\r' all end a line (LSP semantics). */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 13 /* \r */) {
        if (text.charCodeAt(i + 1) === 10) i++;
        this.starts.push(i + 1);
      } else if (c === 10) this.starts.push(i + 1);
    }
  }

  lineOf(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}
