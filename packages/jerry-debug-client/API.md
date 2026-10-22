# @ohjs/jerry-debug-client — API

TypeScript client for the **JerryScript debugger protocol v9** (JerryScript 2.3.0 as shipped in
OpenHarmony 6.1-LTS `third_party_jerryscript`, used by ACE lite on small-system devices).
Audience: the author of `@ohjs/debug-adapter` (DAP ↔ jerry). It has no runtime dependencies beyond Node
built-ins (`node:net`, `node:events`).

Transport: WebSocket framing over raw TCP. This is the fixed handshake that `jerry-ext/debugger/debugger-ws.c`
accepts. Frames are binary FIN frames with payloads of at most 125 bytes. Client frames are masked with a zero
key. On a device the engine listens on port 5001. Reach it with `hdc fport tcp:<local> tcp:5001`.

## Connecting

```ts
import { JerryDebugClient } from '@ohjs/jerry-debug-client';

const c = await JerryDebugClient.connect({ host: '127.0.0.1', port: 19001, timeoutMs: 5000 });
c.config; // { littleEndian, version: 9, maxMessageSize, cpointerSize: 2|4 }
```

- `connect()` resolves after the handshake and the CONFIGURATION message.
- It rejects with `JerryProtocolError` in these cases:
  - the version is not 9;
  - the cpointer size is not 2 or 4;
  - the handshake fails;
  - the timeout expires;
  - the socket closes.
- `JerryDebugClient.attach(socket, timeoutMs?)` does the same over any `JerrySocket`, meaning any object with
  `write`, `on('data'|'close'|'error')` and `destroy`. Use it for tests or custom transports.

## Events (`EventEmitter<JerryClientEvents>`, typed)

| event                | payload                 | notes                                                                                                   |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `scriptParsed`       | `JerryScriptParsed`     | `{ sourceName, source, functions: JerryFunction[] }`                                                    |
| `parseError`         | –                       | The engine reported a syntax error.                                                                     |
| `stopped`            | `JerryStoppedEvent`     | `{ reason, location, breakpointIds, exception? }`                                                       |
| `resumed`            | –                       | Emitted synchronously by `continue`/`step*`.                                                            |
| `output`             | `JerryOutputEvent`      | `{ category: 'stdout'\|'error'\|'warning'\|'debug'\|'trace', text }` (engine `print`/console)           |
| `breakpointResolved` | `JerryBreakpoint`       | A pending breakpoint became verified.                                                                   |
| `functionReleased`   | `number` (byte-code cp) | The client has already answered with FREE_BYTE_CODE_CP.                                                 |
| `waitForSource`      | –                       | Only if the engine waits for client sources. With no listener, the client auto-replies NO_MORE_SOURCES. |
| `close`              | –                       | Socket closed or the engine sent CLOSE_CONNECTION, e.g. when the script ends.                           |
| `error`              | `Error`                 | Protocol or socket error. The connection is closed afterwards.                                          |

`StopReason` takes one of these values:

| reason       | meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `entry`      | First stop before any resume. jerry stops at the first statement. |
| `breakpoint` | `breakpointIds` is non-empty.                                     |
| `step`       | Stop after a step command.                                        |
| `exception`  | `exception` holds the engine's string for the thrown value.       |
| `pause`      | Stop after `pause()`.                                             |

`JerryLocation` has the fields `{ sourceName, line, functionName, byteCodeCp, offset, exact }`.

- `functionName` is `''` for the script body.
- `exact` is false when the offset was mapped to the nearest lower breakpoint offset. Backtrace frames other than
  the top one are usually inexact.
- `location` is `undefined` if the function has already been released.

The parser stops automatically. The client answers WAITING_AFTER_PARSE with PARSER_RESUME and
RELEASE_BYTE_CODE_CP with FREE_BYTE_CODE_CP.

## Breakpoints

```ts
const bp = c.setBreakpoint('sample.js', 3); // JerryBreakpoint { id, sourceName, requestedLine, line, verified }
c.clearBreakpoint(bp.id); // -> boolean
c.clearAllBreakpoints();
c.breakpointList; // snapshot
c.breakableLines('sample.js'); // number[] over live functions
c.setExceptionBreak(false); // EXCEPTION_CONFIG (engine default: on)
```

- **Source name matching.** Names match exactly or by path suffix, so `sample.js` matches `/data/app/sample.js`.
  Backslashes are normalised.
- **Lines must be breakable.** jerry only accepts lines that appear in its breakpoint list; there is no line
  snapping. To implement DAP `breakpointLocations`, use `breakableLines()` and move the line yourself.
- **One breakpoint can cover several places.** It is enabled in every live function instance that contains the
  line, for example after the same code is evaluated twice.
- **Pending breakpoints.** A breakpoint on code that is not parsed yet stays `verified: false`.
  - While any breakpoint is pending, the client keeps the engine's wait-after-parse mode on (PARSER_CONFIG 1).
  - A matching parse then resolves the breakpoint before execution starts and emits `breakpointResolved`.
- **Released code.** If the code of a verified breakpoint is released, the breakpoint becomes pending again.

## Execution control

All of these need `c.stopped === true` and throw `JerryProtocolError` otherwise. `pause()` is the exception and
works while running.

```ts
c.continue(); // CONTINUE
c.stepIn(); // STEP
c.stepOver(); // NEXT
c.stepOut(); // FINISH
c.pause(); // STOP (while running)
c.stopped;
c.location;
```

## Inspection (stopped only; promises resolve in request order)

```ts
const bt = await c.backtrace({ minDepth: 0, maxDepth: 0 /* all */, total: true });
// { total: number|undefined, frames: [{ index, location }] }

const r = await c.evaluate('a+b', /* frameIndex */ 0); // { ok: true, value: '10' }
await c.throwValue('new Error("x")'); // EVAL subtype THROW

const scopes = await c.scopeChain(); // [{ level, kind, kindName: 'local'|'closure'|'global'|'with'|'catch' }]
const vars = await c.scopeVariables(0); // [{ name, kind, typeName, value }]

await c.memStats(); // needs JERRY_MEM_STATS in the engine, otherwise zeros
c.close();
```

- `value` is the engine's string conversion of the value. Values of type object show as `[object Object]`, and
  errors set `ok: false`.
- Long expressions are split into EVAL + EVAL_PART messages according to `maxMessageSize`.
- Pending requests reject with `JerryProtocolError('connection closed')` when the connection closes.

## Mapping hints for the DAP adapter

| DAP request                                          | Client call                                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setBreakpoints`                                     | `clearBreakpoint` for the old ids of that source, then `setBreakpoint` per line. `verified` maps directly, and `breakpointResolved` maps to a `breakpoint` event with reason `changed`. |
| `stackTrace`                                         | `backtrace({ total: true, minDepth: startFrame, maxDepth: startFrame + levels })`                                                                                                       |
| `scopes` / `variables`                               | `scopeChain()` / `scopeVariables(level)`. Only the top frame is supported by the protocol.                                                                                              |
| `evaluate`                                           | `evaluate(expr, frameIndex)`                                                                                                                                                            |
| `next` / `stepIn` / `stepOut` / `continue` / `pause` | `stepOver` / `stepIn` / `stepOut` / `continue` / `pause`                                                                                                                                |
| `source`                                             | `parsedScripts` (each script carries its full `source`)                                                                                                                                 |

Low-level exports: `ServerMsg`, `ClientMsg`, `encodeClientFrame`, `WsDecoder`, `parseScopeVariables`, `sourceNameMatches`.

## Tests

- **Unit tests.** `pnpm test` runs `src/*.test.ts` against a mock engine socket (`mock-socket.test-helper.ts`).
- **e2e test.** `node test/e2e/qemu-jsdebug.e2e.mjs`, after `tsc -b`.
  - It needs developtools_hdc `lite/test/qemu-ide/run-qemu-hdcd.sh jsdebug` and a host `hdc`.
  - It runs `hdc -s 127.0.0.1:8711 tconn 127.0.0.1:18710` and then `fport tcp:19001 tcp:5001`.
  - It checks: breakpoint hit, backtrace, eval `a+b` = 10, step, and continue to the end.
  - Exit code 77 means the environment is missing.
