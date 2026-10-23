/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import {
  ClientMsg,
  EVAL_OK,
  EvalKind,
  JERRY_DEBUGGER_VERSION,
  LITTLE_ENDIAN_FLAG,
  OutputSubtype,
  ScopeKind,
  ServerMsg,
  ValueKind,
} from './protocol.js';
import { encodeClientFrame, HANDSHAKE_REQUEST, WsDecoder } from './websocket.js';
import type {
  JerryBacktrace,
  JerryBreakpoint,
  JerryClientEvents,
  JerryConfig,
  JerryEvalResult,
  JerryFunction,
  JerryLocation,
  JerryMemStats,
  JerryScope,
  JerryScriptParsed,
  JerryStackFrame,
  JerryVariable,
  OutputCategory,
  StopReason,
} from './types.js';

/** The subset of net.Socket the client needs; lets tests inject a mock. */
export interface JerrySocket {
  write(data: Uint8Array): unknown;
  on(event: 'data', cb: (chunk: Buffer) => void): unknown;
  on(event: 'close', cb: () => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  destroy(): unknown;
}

export interface JerryConnectOptions {
  host?: string;
  port?: number;
  /** Handshake + CONFIGURATION timeout. Default 5000 ms. */
  timeoutMs?: number;
}

export class JerryProtocolError extends Error {}

interface Pending<T> {
  resolve(v: T): void;
  reject(e: Error): void;
}

interface ParseState {
  stack: Array<{ line: number; column: number; name: string; lines: number[]; offsets: number[] }>;
  source: string;
  sourceName: string;
  functionName: string;
  newFunctions: JerryFunction[];
  sourceBytes: Buffer[];
  nameBytes: Buffer[];
  funcNameBytes: Buffer[];
}

interface BreakpointState {
  bp: JerryBreakpoint;
  /** "cp:offset" keys currently enabled in the engine. */
  active: Set<string>;
}

const SCOPE_NAMES: Record<number, JerryScope['kindName']> = {
  [ScopeKind.WITH]: 'with',
  [ScopeKind.LOCAL]: 'local',
  [ScopeKind.CLOSURE]: 'closure',
  [ScopeKind.GLOBAL]: 'global',
  [ScopeKind.NON_CLOSURE]: 'catch',
};

const VALUE_NAMES: Record<number, string> = {
  [ValueKind.NONE]: 'none',
  [ValueKind.UNDEFINED]: 'undefined',
  [ValueKind.NULL]: 'null',
  [ValueKind.BOOLEAN]: 'boolean',
  [ValueKind.NUMBER]: 'number',
  [ValueKind.STRING]: 'string',
  [ValueKind.FUNCTION]: 'function',
  [ValueKind.ARRAY]: 'array',
  [ValueKind.OBJECT]: 'object',
};

const OUTPUT_CATEGORIES: Record<number, OutputCategory> = {
  [OutputSubtype.OK]: 'stdout',
  [OutputSubtype.ERROR]: 'error',
  [OutputSubtype.WARNING]: 'warning',
  [OutputSubtype.DEBUG]: 'debug',
  [OutputSubtype.TRACE]: 'trace',
};

/** Source names match if equal or one is a path suffix of the other ("a/b.js" vs "b.js"). */
export function sourceNameMatches(actual: string, wanted: string): boolean {
  if (actual === wanted) return true;
  const a = actual.replace(/\\/g, '/');
  const w = wanted.replace(/\\/g, '/');
  return a === w || a.endsWith('/' + w) || w.endsWith('/' + a);
}

/**
 * JerryScript debugger protocol v9 client.
 *
 * Create with {@link JerryDebugClient.connect} (TCP) or {@link JerryDebugClient.attach} (any socket),
 * then listen to typed events (see {@link JerryClientEvents}).
 */
export class JerryDebugClient extends EventEmitter<JerryClientEvents> {
  private readonly decoder = new WsDecoder();
  private cfg: JerryConfig | undefined;
  private configWaiter: Pending<JerryConfig> | undefined;
  private closed = false;

  private parse: ParseState | undefined;
  private readonly functions = new Map<number, JerryFunction>();
  private readonly scripts: JerryScriptParsed[] = [];

  private readonly breakpoints = new Map<number, BreakpointState>();
  private nextBreakpointId = 1;
  private parserWaitEnabled = false;

  private stoppedAt: JerryLocation | undefined;
  private isStopped = false;
  private everResumed = false;
  private lastResume: 'continue' | 'step' | 'pause' | undefined;

  private exceptionText: Buffer[] = [];
  private outputBuf: Buffer[] = [];
  private evalBuf: Buffer[] = [];
  private backtraceTotal: number | undefined;
  private backtraceFrames: JerryStackFrame[] = [];
  private scopeBuf: Buffer[] = [];
  private varsBuf: Buffer[] = [];

  private readonly evalQ: Pending<JerryEvalResult>[] = [];
  private readonly backtraceQ: Pending<JerryBacktrace>[] = [];
  private readonly scopeQ: Pending<JerryScope[]>[] = [];
  private readonly varsQ: Pending<JerryVariable[]>[] = [];
  private readonly memQ: Pending<JerryMemStats>[] = [];

  private constructor(private readonly socket: JerrySocket) {
    super();
  }

  /** Open a TCP connection, perform the WebSocket handshake and wait for CONFIGURATION. */
  static async connect(opts: JerryConnectOptions = {}): Promise<JerryDebugClient> {
    const host = opts.host ?? '127.0.0.1';
    const port = opts.port ?? 5001;
    const sock = createConnection({ host, port });
    sock.setNoDelay(true);
    await new Promise<void>((resolve, reject) => {
      sock.once('connect', resolve);
      sock.once('error', reject);
    });
    return JerryDebugClient.attach(sock, opts.timeoutMs);
  }

  /** Use an already-connected socket (or a mock). Resolves after the CONFIGURATION message. */
  static async attach(socket: JerrySocket, timeoutMs = 5000): Promise<JerryDebugClient> {
    const client = new JerryDebugClient(socket);
    const ready = new Promise<JerryConfig>((resolve, reject) => {
      client.configWaiter = { resolve, reject };
    });
    socket.on('data', (chunk) => client.onData(chunk));
    socket.on('close', () => client.onClose());
    socket.on('error', (err) => client.fail(err));
    socket.write(Buffer.from(HANDSHAKE_REQUEST, 'latin1'));
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new JerryProtocolError(`jerry debugger handshake timed out after ${timeoutMs} ms`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([ready, timeout]);
    } catch (e) {
      socket.destroy();
      throw e;
    } finally {
      clearTimeout(timer);
    }
    return client;
  }

  // ------------------------------------------------------------------ state accessors

  get config(): JerryConfig {
    if (!this.cfg) throw new JerryProtocolError('not configured');
    return this.cfg;
  }

  /** True while the engine is halted (breakpoint, step, exception, entry). */
  get stopped(): boolean {
    return this.isStopped;
  }

  get location(): JerryLocation | undefined {
    return this.stoppedAt;
  }

  /** All scripts parsed so far (in order). */
  get parsedScripts(): readonly JerryScriptParsed[] {
    return this.scripts;
  }

  /** Live (not released) functions keyed by byte-code cp. */
  get liveFunctions(): ReadonlyMap<number, JerryFunction> {
    return this.functions;
  }

  get breakpointList(): JerryBreakpoint[] {
    return [...this.breakpoints.values()].map((s) => ({ ...s.bp }));
  }

  // ------------------------------------------------------------------ breakpoints

  /**
   * Set a breakpoint at file:line. If a parsed function has that breakable line it is enabled now
   * (verified: true); otherwise it stays pending and is resolved when a matching source is parsed.
   */
  setBreakpoint(sourceName: string, line: number): JerryBreakpoint {
    const id = this.nextBreakpointId++;
    const state: BreakpointState = {
      bp: { id, sourceName, requestedLine: line, line, verified: false },
      active: new Set(),
    };
    this.breakpoints.set(id, state);
    this.resolveBreakpoint(state, [...this.functions.values()]);
    this.updateParserWait();
    return { ...state.bp };
  }

  /** Remove a breakpoint by id. Returns false if unknown. */
  clearBreakpoint(id: number): boolean {
    const state = this.breakpoints.get(id);
    if (!state) return false;
    for (const key of state.active) this.sendBreakpointUpdate(false, key);
    this.breakpoints.delete(id);
    this.updateParserWait();
    return true;
  }

  clearAllBreakpoints(): void {
    for (const id of [...this.breakpoints.keys()]) this.clearBreakpoint(id);
  }

  /** Breakable lines known for a source (union over its live functions). */
  breakableLines(sourceName: string): number[] {
    const set = new Set<number>();
    for (const f of this.functions.values()) {
      if (sourceNameMatches(f.sourceName, sourceName)) f.lines.forEach((l) => set.add(l));
    }
    return [...set].sort((a, b) => a - b);
  }

  /** Stop on thrown exceptions (EXCEPTION_CONFIG). Engine default is enabled. */
  setExceptionBreak(enabled: boolean): void {
    this.send(ClientMsg.EXCEPTION_CONFIG, Buffer.from([enabled ? 1 : 0]));
  }

  // ------------------------------------------------------------------ execution control

  continue(): void {
    this.resume(ClientMsg.CONTINUE, 'continue');
  }

  stepIn(): void {
    this.resume(ClientMsg.STEP, 'step');
  }

  stepOver(): void {
    this.resume(ClientMsg.NEXT, 'step');
  }

  stepOut(): void {
    this.resume(ClientMsg.FINISH, 'step');
  }

  /** Ask a running engine to halt at the next breakable statement. */
  pause(): void {
    this.lastResume = 'pause';
    this.send(ClientMsg.STOP);
  }

  // ------------------------------------------------------------------ inspection (stopped only)

  /** Request stack frames [minDepth, maxDepth); maxDepth 0 = all. */
  backtrace(opts: { minDepth?: number; maxDepth?: number; total?: boolean } = {}): Promise<JerryBacktrace> {
    this.requireStopped('backtrace');
    const data = Buffer.alloc(9);
    this.writeU32(data, opts.minDepth ?? 0, 0);
    this.writeU32(data, opts.maxDepth ?? 0, 4);
    data[8] = opts.total ? 1 : 0;
    return this.request(this.backtraceQ, () => this.send(ClientMsg.GET_BACKTRACE, data));
  }

  /** Evaluate an expression in frame `frameIndex` (0 = top). */
  evaluate(expression: string, frameIndex = 0): Promise<JerryEvalResult> {
    return this.sendEval(EvalKind.EVAL, expression, frameIndex);
  }

  /** Throw the value of `expression` at the current stop point. */
  throwValue(expression: string): Promise<JerryEvalResult> {
    return this.sendEval(EvalKind.THROW, expression, 0);
  }

  /** Scope chain of the top frame. */
  scopeChain(): Promise<JerryScope[]> {
    this.requireStopped('scopeChain');
    return this.request(this.scopeQ, () => this.send(ClientMsg.GET_SCOPE_CHAIN));
  }

  /** Variables of scope `level` (index into {@link scopeChain}). */
  scopeVariables(level: number): Promise<JerryVariable[]> {
    this.requireStopped('scopeVariables');
    const data = Buffer.alloc(4);
    this.writeU32(data, level, 0);
    return this.request(this.varsQ, () => this.send(ClientMsg.GET_SCOPE_VARIABLES, data));
  }

  /** Engine memory statistics (needs JERRY_MEM_STATS in the engine build, otherwise zeros). */
  memStats(): Promise<JerryMemStats> {
    return this.request(this.memQ, () => this.send(ClientMsg.MEMSTATS));
  }

  /** Answer WAIT_FOR_SOURCE: no client-provided sources. */
  noMoreSources(): void {
    this.send(ClientMsg.NO_MORE_SOURCES);
  }

  /** Close the connection (the engine continues without debugger). */
  close(): void {
    if (this.closed) return;
    this.socket.destroy();
    this.onClose();
  }

  // ------------------------------------------------------------------ internals: sending

  private send(type: ClientMsg, data: Uint8Array = new Uint8Array(0)): void {
    if (this.closed) throw new JerryProtocolError('connection closed');
    const max = this.cfg?.maxMessageSize ?? 125;
    if (1 + data.length > max) {
      throw new JerryProtocolError(`message ${type} too large: ${1 + data.length} > ${max}`);
    }
    const payload = Buffer.alloc(1 + data.length);
    payload[0] = type;
    payload.set(data, 1);
    this.socket.write(encodeClientFrame(payload));
  }

  private resume(type: ClientMsg, kind: 'continue' | 'step'): void {
    this.requireStopped(kind);
    this.lastResume = kind;
    this.everResumed = true;
    this.isStopped = false;
    this.stoppedAt = undefined;
    this.send(type);
    this.emit('resumed');
  }

  private sendEval(kind: EvalKind, code: string, frameIndex: number): Promise<JerryEvalResult> {
    this.requireStopped('evaluate');
    const codeBytes = Buffer.from(code, 'utf8');
    const args = Buffer.alloc(5 + codeBytes.length);
    this.writeU32(args, frameIndex, 0);
    args[4] = kind;
    codeBytes.copy(args, 5);
    return this.request(this.evalQ, () => {
      const max = this.config.maxMessageSize;
      const first = Math.min(max - 5, args.length);
      const head = Buffer.alloc(4 + first);
      this.writeU32(head, args.length, 0);
      args.copy(head, 4, 0, first);
      this.send(ClientMsg.EVAL, head);
      for (let off = first; off < args.length; off += max - 1) {
        this.send(ClientMsg.EVAL_PART, args.subarray(off, Math.min(args.length, off + max - 1)));
      }
    });
  }

  private request<T>(queue: Pending<T>[], doSend: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.closed) {
        reject(new JerryProtocolError('connection closed'));
        return;
      }
      queue.push({ resolve, reject });
      try {
        doSend();
      } catch (e) {
        queue.pop();
        reject(e as Error);
      }
    });
  }

  private requireStopped(op: string): void {
    if (!this.isStopped) throw new JerryProtocolError(`${op}: engine is not stopped`);
  }

  private sendBreakpointUpdate(enable: boolean, key: string): void {
    const [cp, offset] = key.split(':').map(Number) as [number, number];
    const data = Buffer.alloc(1 + this.config.cpointerSize + 4);
    data[0] = enable ? 1 : 0;
    this.writeCp(data, cp, 1);
    this.writeU32(data, offset, 1 + this.config.cpointerSize);
    this.send(ClientMsg.UPDATE_BREAKPOINT, data);
  }

  private resolveBreakpoint(state: BreakpointState, candidates: JerryFunction[]): boolean {
    let added = false;
    for (const f of candidates) {
      if (!sourceNameMatches(f.sourceName, state.bp.sourceName)) continue;
      const i = f.lines.indexOf(state.bp.requestedLine);
      if (i < 0) continue;
      const key = `${f.byteCodeCp}:${f.offsets[i]}`;
      if (state.active.has(key)) continue;
      state.active.add(key);
      this.sendBreakpointUpdate(true, key);
      added = true;
    }
    if (added && !state.bp.verified) {
      state.bp.verified = true;
      this.emit('breakpointResolved', { ...state.bp });
    }
    return added;
  }

  /** Keep PARSER_CONFIG(wait-after-parse) on while pending breakpoints exist. */
  private updateParserWait(): void {
    const want = [...this.breakpoints.values()].some((s) => !s.bp.verified);
    if (want !== this.parserWaitEnabled && this.cfg && !this.closed) {
      this.parserWaitEnabled = want;
      this.send(ClientMsg.PARSER_CONFIG, Buffer.from([want ? 1 : 0]));
    }
  }

  // ------------------------------------------------------------------ internals: receiving

  private onData(chunk: Buffer): void {
    let messages: Buffer[];
    try {
      messages = this.decoder.push(chunk);
    } catch (e) {
      this.fail(e as Error);
      return;
    }
    for (const m of messages) {
      try {
        this.handle(m);
      } catch (e) {
        this.fail(e instanceof Error ? e : new Error(String(e)));
        return;
      }
    }
  }

  private fail(err: Error): void {
    if (this.configWaiter) {
      this.configWaiter.reject(err);
      this.configWaiter = undefined;
    } else if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    }
    this.close();
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.isStopped = false;
    const err = new JerryProtocolError('connection closed');
    this.configWaiter?.reject(err);
    this.configWaiter = undefined;
    for (const q of [
      this.evalQ,
      this.backtraceQ,
      this.scopeQ,
      this.varsQ,
      this.memQ,
    ] as Pending<unknown>[][]) {
      q.splice(0).forEach((p) => p.reject(err));
    }
    this.emit('close');
  }

  private handle(msg: Buffer): void {
    const type = msg[0] as ServerMsg;
    const data = msg.subarray(1);
    if (!this.cfg) {
      if (type !== ServerMsg.CONFIGURATION)
        throw new JerryProtocolError(`expected CONFIGURATION, got ${type}`);
      this.handleConfig(data);
      return;
    }
    switch (type) {
      case ServerMsg.PARSE_ERROR:
        this.parse = undefined;
        this.emit('parseError');
        return;
      case ServerMsg.SOURCE_CODE:
      case ServerMsg.SOURCE_CODE_END:
      case ServerMsg.SOURCE_CODE_NAME:
      case ServerMsg.SOURCE_CODE_NAME_END:
      case ServerMsg.FUNCTION_NAME:
      case ServerMsg.FUNCTION_NAME_END:
      case ServerMsg.PARSE_FUNCTION:
      case ServerMsg.BREAKPOINT_LIST:
      case ServerMsg.BREAKPOINT_OFFSET_LIST:
      case ServerMsg.BYTE_CODE_CP:
        this.handleParse(type, data);
        return;
      case ServerMsg.WAITING_AFTER_PARSE:
        this.send(ClientMsg.PARSER_RESUME);
        return;
      case ServerMsg.RELEASE_BYTE_CODE_CP:
        this.handleRelease(this.readCp(data, 0));
        return;
      case ServerMsg.MEMSTATS_RECEIVE: {
        const v = [0, 1, 2, 3, 4].map((i) => this.readU32(data, i * 4));
        this.memQ.shift()?.resolve({
          allocatedBytes: v[0] ?? 0,
          byteCodeBytes: v[1] ?? 0,
          stringBytes: v[2] ?? 0,
          objectBytes: v[3] ?? 0,
          propertyBytes: v[4] ?? 0,
        });
        return;
      }
      case ServerMsg.BREAKPOINT_HIT:
      case ServerMsg.EXCEPTION_HIT:
        this.handleHit(type === ServerMsg.EXCEPTION_HIT, data);
        return;
      case ServerMsg.EXCEPTION_STR:
      case ServerMsg.EXCEPTION_STR_END:
        this.exceptionText.push(Buffer.from(data));
        return;
      case ServerMsg.BACKTRACE_TOTAL:
        this.backtraceTotal = this.readU32(data, 0);
        return;
      case ServerMsg.BACKTRACE:
      case ServerMsg.BACKTRACE_END: {
        const frameSize = this.config.cpointerSize + 4;
        for (let p = 0; p + frameSize <= data.length; p += frameSize) {
          const cp = this.readCp(data, p);
          const off = this.readU32(data, p + this.config.cpointerSize);
          this.backtraceFrames.push({ index: this.backtraceFrames.length, location: this.locate(cp, off) });
        }
        if (type === ServerMsg.BACKTRACE_END) {
          const result: JerryBacktrace = { total: this.backtraceTotal, frames: this.backtraceFrames };
          this.backtraceFrames = [];
          this.backtraceTotal = undefined;
          this.backtraceQ.shift()?.resolve(result);
        }
        return;
      }
      case ServerMsg.EVAL_RESULT:
      case ServerMsg.EVAL_RESULT_END: {
        this.evalBuf.push(Buffer.from(data));
        if (type === ServerMsg.EVAL_RESULT_END) {
          const all = Buffer.concat(this.evalBuf.splice(0));
          const subtype = all[all.length - 1];
          const value = all.subarray(0, Math.max(0, all.length - 1)).toString('utf8');
          this.evalQ.shift()?.resolve({ ok: subtype === EVAL_OK, value });
        }
        return;
      }
      case ServerMsg.OUTPUT_RESULT:
      case ServerMsg.OUTPUT_RESULT_END: {
        this.outputBuf.push(Buffer.from(data));
        if (type === ServerMsg.OUTPUT_RESULT_END) {
          const all = Buffer.concat(this.outputBuf.splice(0));
          const subtype = all[all.length - 1] ?? OutputSubtype.OK;
          this.emit('output', {
            category: OUTPUT_CATEGORIES[subtype] ?? 'stdout',
            text: all.subarray(0, Math.max(0, all.length - 1)).toString('utf8'),
          });
        }
        return;
      }
      case ServerMsg.WAIT_FOR_SOURCE:
        if (this.listenerCount('waitForSource') > 0) this.emit('waitForSource');
        else this.noMoreSources();
        return;
      case ServerMsg.SCOPE_CHAIN:
      case ServerMsg.SCOPE_CHAIN_END:
        this.scopeBuf.push(Buffer.from(data));
        if (type === ServerMsg.SCOPE_CHAIN_END) {
          const all = Buffer.concat(this.scopeBuf.splice(0));
          this.scopeQ.shift()?.resolve(
            [...all].map((k, level) => ({
              level,
              kind: k as ScopeKind,
              kindName: SCOPE_NAMES[k] ?? 'local',
            })),
          );
        }
        return;
      case ServerMsg.SCOPE_VARIABLES:
      case ServerMsg.SCOPE_VARIABLES_END:
        this.varsBuf.push(Buffer.from(data));
        if (type === ServerMsg.SCOPE_VARIABLES_END) {
          this.varsQ.shift()?.resolve(parseScopeVariables(Buffer.concat(this.varsBuf.splice(0))));
        }
        return;
      case ServerMsg.CLOSE_CONNECTION:
        this.close();
        return;
      default:
        throw new JerryProtocolError(`unknown jerry debugger message type ${type}`);
    }
  }

  private handleConfig(data: Buffer): void {
    if (data.length < 7) throw new JerryProtocolError('short CONFIGURATION message');
    const littleEndian = ((data[0] ?? 0) & LITTLE_ENDIAN_FLAG) !== 0;
    const version = littleEndian ? data.readUInt32LE(1) : data.readUInt32BE(1);
    const cfg: JerryConfig = {
      littleEndian,
      version,
      maxMessageSize: data[5] ?? 0,
      cpointerSize: data[6] ?? 0,
    };
    if (version !== JERRY_DEBUGGER_VERSION) {
      throw new JerryProtocolError(
        `unsupported jerry debugger version ${version} (want ${JERRY_DEBUGGER_VERSION})`,
      );
    }
    if (cfg.cpointerSize !== 2 && cfg.cpointerSize !== 4) {
      throw new JerryProtocolError(`unsupported cpointer size ${cfg.cpointerSize}`);
    }
    if (cfg.maxMessageSize < 16 || cfg.maxMessageSize > 125) {
      throw new JerryProtocolError(`unsupported max message size ${cfg.maxMessageSize}`);
    }
    this.cfg = cfg;
    this.configWaiter?.resolve(cfg);
    this.configWaiter = undefined;
  }

  private handleParse(type: ServerMsg, data: Buffer): void {
    const st: ParseState = (this.parse ??= {
      stack: [{ line: 1, column: 1, name: '', lines: [], offsets: [] }],
      source: '',
      sourceName: '',
      functionName: '',
      newFunctions: [],
      sourceBytes: [],
      nameBytes: [],
      funcNameBytes: [],
    });
    const top = st.stack[st.stack.length - 1];
    switch (type) {
      case ServerMsg.SOURCE_CODE:
        st.sourceBytes.push(Buffer.from(data));
        return;
      case ServerMsg.SOURCE_CODE_END:
        st.sourceBytes.push(Buffer.from(data));
        st.source = Buffer.concat(st.sourceBytes.splice(0)).toString('utf8');
        return;
      case ServerMsg.SOURCE_CODE_NAME:
        st.nameBytes.push(Buffer.from(data));
        return;
      case ServerMsg.SOURCE_CODE_NAME_END:
        st.nameBytes.push(Buffer.from(data));
        st.sourceName = Buffer.concat(st.nameBytes.splice(0)).toString('utf8');
        return;
      case ServerMsg.FUNCTION_NAME:
        st.funcNameBytes.push(Buffer.from(data));
        return;
      case ServerMsg.FUNCTION_NAME_END:
        st.funcNameBytes.push(Buffer.from(data));
        st.functionName = Buffer.concat(st.funcNameBytes.splice(0)).toString('utf8');
        return;
      case ServerMsg.PARSE_FUNCTION:
        st.stack.push({
          line: this.readU32(data, 0),
          column: this.readU32(data, 4),
          name: st.functionName,
          lines: [],
          offsets: [],
        });
        st.functionName = '';
        return;
      case ServerMsg.BREAKPOINT_LIST:
      case ServerMsg.BREAKPOINT_OFFSET_LIST: {
        if (!top) throw new JerryProtocolError('breakpoint list outside function');
        const dst = type === ServerMsg.BREAKPOINT_LIST ? top.lines : top.offsets;
        for (let p = 0; p + 4 <= data.length; p += 4) dst.push(this.readU32(data, p));
        return;
      }
      case ServerMsg.BYTE_CODE_CP: {
        const desc = st.stack.pop();
        if (!desc) throw new JerryProtocolError('BYTE_CODE_CP without function');
        const fn: JerryFunction = {
          byteCodeCp: this.readCp(data, 0),
          isFunc: st.stack.length > 0,
          sourceName: st.sourceName,
          name: desc.name,
          line: desc.line,
          column: desc.column,
          lines: desc.lines,
          offsets: desc.offsets,
        };
        st.newFunctions.push(fn);
        if (st.stack.length === 0) this.finishParse(st);
        return;
      }
      /* c8 ignore next 2 */
      default:
        return;
    }
  }

  private finishParse(st: ParseState): void {
    this.parse = undefined;
    // Source name is only known at the end for nested functions parsed before SOURCE_CODE_NAME_END.
    for (const f of st.newFunctions) {
      f.sourceName = st.sourceName;
      this.functions.set(f.byteCodeCp, f);
    }
    const script: JerryScriptParsed = {
      sourceName: st.sourceName,
      source: st.source,
      functions: st.newFunctions,
    };
    this.scripts.push(script);
    for (const s of this.breakpoints.values()) this.resolveBreakpoint(s, st.newFunctions);
    this.updateParserWait();
    this.emit('scriptParsed', script);
  }

  private handleRelease(cp: number): void {
    this.functions.delete(cp);
    const prefix = `${cp}:`;
    for (const s of this.breakpoints.values()) {
      for (const k of [...s.active]) if (k.startsWith(prefix)) s.active.delete(k);
      if (s.active.size === 0 && s.bp.verified) s.bp.verified = false;
    }
    const data = Buffer.alloc(this.config.cpointerSize);
    this.writeCp(data, cp, 0);
    this.send(ClientMsg.FREE_BYTE_CODE_CP, data);
    this.updateParserWait();
    this.emit('functionReleased', cp);
  }

  private handleHit(isException: boolean, data: Buffer): void {
    const cp = this.readCp(data, 0);
    const offset = this.readU32(data, this.config.cpointerSize);
    const location = this.locate(cp, offset);
    const key = `${cp}:${offset}`;
    const ids = [...this.breakpoints.values()].filter((s) => s.active.has(key)).map((s) => s.bp.id);
    let reason: StopReason;
    if (isException) reason = 'exception';
    else if (ids.length > 0) reason = 'breakpoint';
    else if (!this.everResumed) reason = 'entry';
    else if (this.lastResume === 'pause') reason = 'pause';
    else reason = 'step';
    const exception = isException ? Buffer.concat(this.exceptionText.splice(0)).toString('utf8') : undefined;
    this.exceptionText = [];
    this.isStopped = true;
    this.stoppedAt = location;
    this.lastResume = undefined;
    this.emit('stopped', {
      reason,
      location,
      breakpointIds: ids,
      ...(exception !== undefined ? { exception } : {}),
    });
  }

  /** Map (cp, offset) to a source line: exact offset, else nearest lower breakpoint offset. */
  locate(cp: number, offset: number): JerryLocation | undefined {
    const f = this.functions.get(cp);
    if (!f) return undefined;
    let best = -1;
    let bestOff = -1;
    for (let i = 0; i < f.offsets.length; i++) {
      const o = f.offsets[i] ?? 0;
      if (o <= offset && o > bestOff) {
        bestOff = o;
        best = i;
      }
    }
    const line = best >= 0 ? (f.lines[best] ?? f.line) : f.line;
    return {
      sourceName: f.sourceName,
      line,
      functionName: f.name,
      byteCodeCp: cp,
      offset,
      exact: bestOff === offset,
    };
  }

  // ------------------------------------------------------------------ byte helpers

  private readU32(b: Buffer, at: number): number {
    if (at + 4 > b.length) throw new JerryProtocolError('truncated message');
    return this.config.littleEndian ? b.readUInt32LE(at) : b.readUInt32BE(at);
  }

  private writeU32(b: Buffer, v: number, at: number): void {
    if (this.config.littleEndian) b.writeUInt32LE(v >>> 0, at);
    else b.writeUInt32BE(v >>> 0, at);
  }

  private readCp(b: Buffer, at: number): number {
    if (this.config.cpointerSize === 4) return this.readU32(b, at);
    if (at + 2 > b.length) throw new JerryProtocolError('truncated message');
    return this.config.littleEndian ? b.readUInt16LE(at) : b.readUInt16BE(at);
  }

  private writeCp(b: Buffer, v: number, at: number): void {
    if (this.config.cpointerSize === 4) this.writeU32(b, v, at);
    else if (this.config.littleEndian) b.writeUInt16LE(v, at);
    else b.writeUInt16BE(v, at);
  }
}

/** Decode SCOPE_VARIABLES payload: repeated [nameLen][name][valueType][valueLen][value]. */
export function parseScopeVariables(buf: Buffer): JerryVariable[] {
  const out: JerryVariable[] = [];
  let p = 0;
  while (p < buf.length) {
    const nameLen = buf[p++] ?? 0;
    const name = buf.subarray(p, p + nameLen).toString('utf8');
    p += nameLen;
    const kind = (buf[p++] ?? ValueKind.NONE) as ValueKind;
    const valueLen = buf[p++] ?? 0;
    const value = buf.subarray(p, p + valueLen).toString('utf8');
    p += valueLen;
    out.push({ name, kind, typeName: VALUE_NAMES[kind] ?? 'unknown', value });
  }
  return out;
}
