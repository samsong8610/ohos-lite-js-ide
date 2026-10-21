/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Placeholders allowed in each command template (NFR-CMP-004: nothing device-specific in code). */
export const COMMAND_PLACEHOLDERS = {
  install: ['hap'],
  uninstall: ['bundle'],
  list: [],
  start: ['bundle', 'ability'],
  stop: ['bundle'],
  log: ['level'],
  disableSignCheck: [],
  setSnapshotMode: ['snapshotFlag'],
  setJsMode: ['snapshotFlag'],
  checkMode: ['snapshotFlag'],
  mkTmp: ['tmpDir'],
} as const satisfies Record<string, readonly string[]>;

export type CommandKey = keyof typeof COMMAND_PLACEHOLDERS;

const commandProps = Object.fromEntries(
  Object.keys(COMMAND_PLACEHOLDERS).map((k) => [k, { type: 'string', minLength: 1 }]),
);

const devicePath = { type: 'string', pattern: '^/' };

/**
 * JSON Schema (draft-07) of a device profile (ARCHITECTURE §5.2, I-2, FR-PRJ-008, NFR-CMP-004).
 * A profile with `extends` may be partial; the resolved profile must satisfy REQUIRED_RESOLVED.
 */
export const DEVICE_PROFILE_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ohos-lite-js-ide/schemas/device-profile.schema.json',
  title: 'OHJS device profile',
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    $schema: { type: 'string' },
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]*$' },
    extends: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]*$' },
    name: { type: 'string' },
    description: { type: 'string' },
    arch: { type: 'string', enum: ['loongarch64', 'arm', 'arm64', 'riscv64', 'x86_64'] },
    kernel: { type: 'string', enum: ['linux', 'liteos_a'] },
    deviceType: {
      type: 'string',
      enum: ['smartVision', 'liteWearable'],
      description: 'bm_lite compares with strcmp; case sensitive.',
    },
    display: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: { type: 'integer', minimum: 1, maximum: 8192 },
        height: { type: 'integer', minimum: 1, maximum: 8192 },
        shape: { type: 'string', enum: ['rect', 'round'] },
        dpi: { type: ['integer', 'null'], minimum: 1 },
      },
    },
    features: {
      type: 'object',
      description: 'ACE Lite FEATURE_* macros of the device firmware (acelite_config.h).',
      propertyNames: { pattern: '^[A-Z][A-Z0-9_]*$' },
      additionalProperties: { type: 'boolean' },
    },
    featuresSource: { type: 'string' },
    connection: {
      type: 'object',
      additionalProperties: false,
      properties: {
        preferred: { type: 'string', enum: ['usb', 'tcp'] },
        fallback: { type: 'array', items: { type: 'string', enum: ['usb', 'tcp'] }, uniqueItems: true },
        tcpHost: { type: 'string' },
        tcpPort: { type: 'integer', minimum: 1, maximum: 65535 },
        usbSerial: { type: 'string' },
      },
    },
    paths: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tmpDir: devicePath,
        snapshotFlag: devicePath,
        appInstallRoot: devicePath,
        firmwareManifest: devicePath,
        hilogcat: devicePath,
      },
    },
    commands: { type: 'object', additionalProperties: false, properties: commandProps },
    debug: {
      type: 'object',
      additionalProperties: false,
      properties: {
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        enableMethod: { type: 'string', enum: ['flagFile', 'none'] },
        enableFlag: devicePath,
        requireDebugFirmware: { type: 'boolean' },
      },
    },
    jerry: {
      type: 'object',
      additionalProperties: false,
      properties: {
        snapshotVersion: { type: 'integer' },
        debuggerProtocol: { type: 'integer' },
        cpointer32: { type: ['boolean', 'null'] },
      },
    },
    timeouts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shellMs: { type: 'integer', minimum: 1 },
        fileSendMinMs: { type: 'integer', minimum: 1 },
        fileSendBytesPerSec: { type: 'integer', minimum: 1 },
      },
    },
  },
} as const;

/** Keys that must be present after `extends` resolution. */
export const REQUIRED_RESOLVED = [
  'arch',
  'kernel',
  'deviceType',
  'display.width',
  'display.height',
  'display.shape',
  'connection.preferred',
  'connection.tcpPort',
  'paths.tmpDir',
  'paths.snapshotFlag',
  'paths.appInstallRoot',
  ...Object.keys(COMMAND_PLACEHOLDERS).map((k) => `commands.${k}`),
  'debug.port',
] as const;
