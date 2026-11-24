/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terser `negate_iife` rewrites Webpack's `(function(){ ... })()` as `!function(){ ... }()`.
 * ACE `jerry_run` uses the script result as the ViewModel. The `!` makes that result the
 * boolean `true`, and the next property read (`onCreate` / `$render`) throws
 * `TypeError: wrong type of argument`. DevEco's bundle keeps the parenthesized form and
 * returns the ViewModel.
 */
export function repairNegatedWebpackIife(source: string): string {
  const matched = source.match(/^!function\(\)\{([\s\S]*)\}\(\);?(\n\/\/# sourceMappingURL=.*)?$/);
  if (!matched) return source;
  const body = matched[1] ?? '';
  const comment = matched[2] ?? '';
  return `(function(){${ensureTopLevelReturn(body)}})();${comment}`;
}

function ensureTopLevelReturn(body: string): string {
  if (hasTopLevelReturn(body)) return body;
  const semi = lastTopLevelSemicolon(body);
  if (semi < 0) return `return ${body}`;
  return `${body.slice(0, semi + 1)}return ${body.slice(semi + 1)}`;
}

function hasTopLevelReturn(body: string): boolean {
  return scanTopLevel(body, (index) => isKeywordAt(body, index, 'return'));
}

function lastTopLevelSemicolon(body: string): number {
  let found = -1;
  scanTopLevel(body, (index) => {
    if (body[index] === ';') found = index;
    return false;
  });
  return found;
}

/** Returns true when `visit` asks to stop. */
function scanTopLevel(body: string, visit: (index: number) => boolean): boolean {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escape = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0 && visit(i)) return true;
  }
  return false;
}

function isKeywordAt(source: string, index: number, word: string): boolean {
  if (!source.startsWith(word, index)) return false;
  const before = source[index - 1];
  const after = source[index + word.length];
  return !isIdentChar(before) && !isIdentChar(after);
}

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}
