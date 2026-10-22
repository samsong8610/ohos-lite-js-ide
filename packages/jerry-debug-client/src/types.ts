/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ScopeKind, ValueKind } from './protocol.js';

/** Values negotiated in the CONFIGURATION message. */
export interface JerryConfig {
  littleEndian: boolean;
  version: number;
  /** Largest message (type byte + data) either side may send. */
  maxMessageSize: number;
  /** Size in bytes of a compressed byte-code pointer (2 or 4). */
  cpointerSize: number;
}

/** One compiled function (or the script body) as reported by the parser. */
export interface JerryFunction {
  byteCodeCp: number;
  /** false for the top-level script body. */
  isFunc: boolean;
  sourceName: string;
  name: string;
  /** 1-based line/column of the function start. */
  line: number;
  column: number;
  /** Breakable lines and their byte-code offsets (same length, pairwise). */
  lines: number[];
  offsets: number[];
}

/** Emitted once per parsed source (script, eval code, or client source). */
export interface JerryScriptParsed {
  sourceName: string;
  source: string;
  functions: JerryFunction[];
}

/** A resolved position in the program. */
export interface JerryLocation {
  sourceName: string;
  line: number;
  /** Name of the enclosing function, '' for the script body. */
  functionName: string;
  byteCodeCp: number;
  offset: number;
  /** false when the offset was mapped to the nearest preceding breakpoint offset. */
  exact: boolean;
}

export type StopReason = 'entry' | 'breakpoint' | 'step' | 'exception' | 'pause';

export interface JerryStoppedEvent {
  reason: StopReason;
  location: JerryLocation | undefined;
  /** Ids of active breakpoints at this location (reason 'breakpoint'). */
  breakpointIds: number[];
  /** Exception text for reason 'exception' (from EXCEPTION_STR), if any. */
  exception?: string;
}

export type OutputCategory = 'stdout' | 'error' | 'warning' | 'debug' | 'trace';

export interface JerryOutputEvent {
  category: OutputCategory;
  text: string;
}

export interface JerryBreakpoint {
  id: number;
  sourceName: string;
  /** Requested line. */
  requestedLine: number;
  /** Actual line; equals requestedLine (jerry only accepts exact breakable lines). */
  line: number;
  /** false until the source is parsed (pending breakpoint). */
  verified: boolean;
}

export interface JerryStackFrame {
  index: number;
  location: JerryLocation | undefined;
}

export interface JerryBacktrace {
  /** Total frame count when requested with `total: true`, else undefined. */
  total: number | undefined;
  frames: JerryStackFrame[];
}

export interface JerryEvalResult {
  ok: boolean;
  /** Engine's string conversion of the result or of the thrown value. */
  value: string;
}

export interface JerryScope {
  level: number;
  kind: ScopeKind;
  kindName: 'with' | 'local' | 'closure' | 'global' | 'catch';
}

export interface JerryVariable {
  name: string;
  kind: ValueKind;
  typeName: string;
  value: string;
}

export interface JerryMemStats {
  allocatedBytes: number;
  byteCodeBytes: number;
  stringBytes: number;
  objectBytes: number;
  propertyBytes: number;
}

export interface JerryClientEvents {
  scriptParsed: [JerryScriptParsed];
  parseError: [];
  stopped: [JerryStoppedEvent];
  resumed: [];
  output: [JerryOutputEvent];
  breakpointResolved: [JerryBreakpoint];
  functionReleased: [number];
  waitForSource: [];
  close: [];
  error: [Error];
}
