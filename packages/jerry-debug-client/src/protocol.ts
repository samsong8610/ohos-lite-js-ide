/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * JerryScript debugger wire protocol, version 9 (JerryScript 2.3.0 as shipped in OpenHarmony 6.1-LTS
 * third_party_jerryscript). Mirrors jerry-debugger/jerry_client_main.py and jerry-core/debugger/debugger.h.
 */

export const JERRY_DEBUGGER_VERSION = 9;

/** Messages sent by the engine (server) to the client. */
export enum ServerMsg {
  CONFIGURATION = 1,
  PARSE_ERROR = 2,
  BYTE_CODE_CP = 3,
  PARSE_FUNCTION = 4,
  BREAKPOINT_LIST = 5,
  BREAKPOINT_OFFSET_LIST = 6,
  SOURCE_CODE = 7,
  SOURCE_CODE_END = 8,
  SOURCE_CODE_NAME = 9,
  SOURCE_CODE_NAME_END = 10,
  FUNCTION_NAME = 11,
  FUNCTION_NAME_END = 12,
  WAITING_AFTER_PARSE = 13,
  RELEASE_BYTE_CODE_CP = 14,
  MEMSTATS_RECEIVE = 15,
  BREAKPOINT_HIT = 16,
  EXCEPTION_HIT = 17,
  EXCEPTION_STR = 18,
  EXCEPTION_STR_END = 19,
  BACKTRACE_TOTAL = 20,
  BACKTRACE = 21,
  BACKTRACE_END = 22,
  EVAL_RESULT = 23,
  EVAL_RESULT_END = 24,
  WAIT_FOR_SOURCE = 25,
  OUTPUT_RESULT = 26,
  OUTPUT_RESULT_END = 27,
  SCOPE_CHAIN = 28,
  SCOPE_CHAIN_END = 29,
  SCOPE_VARIABLES = 30,
  SCOPE_VARIABLES_END = 31,
  CLOSE_CONNECTION = 32,
}

/** Messages sent by the client to the engine. */
export enum ClientMsg {
  FREE_BYTE_CODE_CP = 1,
  UPDATE_BREAKPOINT = 2,
  EXCEPTION_CONFIG = 3,
  PARSER_CONFIG = 4,
  MEMSTATS = 5,
  STOP = 6,
  PARSER_RESUME = 7,
  CLIENT_SOURCE = 8,
  CLIENT_SOURCE_PART = 9,
  NO_MORE_SOURCES = 10,
  CONTEXT_RESET = 11,
  CONTINUE = 12,
  STEP = 13,
  NEXT = 14,
  FINISH = 15,
  GET_BACKTRACE = 16,
  EVAL = 17,
  EVAL_PART = 18,
  GET_SCOPE_CHAIN = 19,
  GET_SCOPE_VARIABLES = 20,
}

export const LITTLE_ENDIAN_FLAG = 0x1;

/** First byte of an EVAL payload. */
export enum EvalKind {
  EVAL = 0,
  THROW = 1,
  ABORT = 2,
}

/** Subtype (last byte) of EVAL_RESULT_END. */
export const EVAL_OK = 1;
export const EVAL_ERROR = 2;

/** Subtype (last byte) of OUTPUT_RESULT_END. */
export enum OutputSubtype {
  OK = 1,
  ERROR = 2,
  WARNING = 3,
  DEBUG = 4,
  TRACE = 5,
}

export enum ScopeKind {
  WITH = 1,
  LOCAL = 2,
  CLOSURE = 3,
  GLOBAL = 4,
  NON_CLOSURE = 5,
}

export enum ValueKind {
  NONE = 1,
  UNDEFINED = 2,
  NULL = 3,
  BOOLEAN = 4,
  NUMBER = 5,
  STRING = 6,
  FUNCTION = 7,
  ARRAY = 8,
  OBJECT = 9,
}
