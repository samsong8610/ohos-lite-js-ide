/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * cmd.exe escaping for `.bat` / `.cmd` launches (ARCHITECTURE §5.1):
 * `cmd.exe /d /s /c "<line>"` with `windowsVerbatimArguments`.
 * Same algorithm as the widely used cross-spawn: MSVCRT quoting first, then `^`-escape cmd metachars;
 * batch files get metachars escaped twice because cmd re-parses the line when invoking them.
 */
const META = /([()\][%!^"`<>&|;, *?])/g;

export function escapeCmdArgument(arg: string, doubleEscapeMeta: boolean): string {
  let a = `${arg}`;
  // backslashes preceding a quote are doubled, the quote itself escaped
  a = a.replace(/(\\*)"/g, '$1$1\\"');
  // trailing backslashes are doubled (they precede the closing quote we add)
  a = a.replace(/(\\*)$/, '$1$1');
  a = `"${a}"`;
  a = a.replace(META, '^$1');
  if (doubleEscapeMeta) a = a.replace(META, '^$1');
  return a;
}

export function escapeCmdCommand(file: string): string {
  return file.replace(META, '^$1');
}

export function isBatchFile(file: string): boolean {
  return /\.(bat|cmd)$/i.test(file);
}

/** Returns the argv for spawning a batch file through cmd.exe. */
export function buildCmdShellArgs(file: string, args: readonly string[]): string[] {
  const line = [escapeCmdCommand(file), ...args.map((a) => escapeCmdArgument(a, true))].join(' ');
  return ['/d', '/s', '/c', `"${line}"`];
}
