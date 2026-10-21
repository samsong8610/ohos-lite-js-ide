/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const evidence = {
  type: 'object',
  required: ['repo', 'file', 'line'],
  additionalProperties: false,
  properties: { repo: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer', minimum: 1 } },
} as const;

const availability = {
  enum: ['code', 'code-doc-missing', 'disabled-by-feature', 'conditional', 'framework'],
} as const;

const field = {
  type: 'object',
  required: ['availability', 'evidence'],
  additionalProperties: false,
  properties: {
    availability,
    since: { type: 'integer' },
    feature: { type: 'string' },
    doc: { type: 'string' },
    values: { type: 'array', items: { type: 'string' }, minItems: 1 },
    valuesSource: { enum: ['code', 'doc', 'code+doc'] },
    evidence: { type: 'array', items: evidence },
  },
} as const;

const fieldMap = { type: 'object', additionalProperties: field } as const;
const names = { type: 'array', items: { type: 'string' } } as const;

/** JSON Schema (draft-07) of a generated components.json data pack. */
export const COMPONENTS_FILE_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ohos-lite-js-ide.invalid/schemas/components.schema.json',
  type: 'object',
  required: [
    'schemaFormat',
    'ohVersion',
    'provisional',
    'target',
    'generator',
    'sources',
    'features',
    'components',
    'common',
    'aceLoader',
    'warnings',
  ],
  additionalProperties: false,
  properties: {
    schemaFormat: { const: 1 },
    ohVersion: { type: 'string', minLength: 1 },
    provisional: { type: 'boolean' },
    provisionalReason: { type: 'string' },
    target: { type: 'string' },
    generator: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['repo', 'path', 'tags'],
        additionalProperties: false,
        properties: {
          repo: { type: 'string' },
          path: { type: 'string' },
          commit: { type: 'string', pattern: '^[0-9a-f]{40}$' },
          tags: names,
          remote: { type: 'string' },
        },
      },
    },
    features: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['value'],
        additionalProperties: false,
        properties: { value: { enum: [true, false, 'conditional'] }, dependsOn: names },
      },
    },
    components: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: [
          'tag',
          'category',
          'availability',
          'implClasses',
          'variants',
          'attributes',
          'styles',
          'events',
          'methods',
          'docOnly',
          'evidence',
        ],
        additionalProperties: false,
        properties: {
          tag: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
          category: { type: 'string' },
          availability,
          feature: { type: 'string' },
          since: { type: 'integer' },
          children: {
            oneOf: [
              { enum: ['any', 'none'] },
              names,
              {
                type: 'object',
                required: ['except'],
                additionalProperties: false,
                properties: { except: names },
              },
            ],
          },
          implClasses: names,
          variants: {
            type: 'array',
            items: {
              type: 'object',
              required: ['implClass', 'typeValues', 'availability'],
              additionalProperties: false,
              properties: {
                implClass: { type: 'string' },
                typeValues: names,
                feature: { type: 'string' },
                availability,
              },
            },
          },
          attributes: fieldMap,
          styles: fieldMap,
          events: fieldMap,
          methods: fieldMap,
          docOnly: {
            type: 'object',
            required: ['attributes', 'styles', 'events', 'methods'],
            additionalProperties: false,
            properties: { attributes: names, styles: names, events: names, methods: names },
          },
          evidence: { type: 'array', items: evidence },
        },
      },
    },
    common: {
      type: 'object',
      required: ['attributes', 'styles', 'events', 'directives'],
      additionalProperties: false,
      properties: { attributes: fieldMap, styles: fieldMap, events: fieldMap, directives: fieldMap },
    },
    aceLoader: {
      type: 'object',
      required: ['imageExtensions', 'specialStyles', 'regexps'],
      additionalProperties: false,
      properties: {
        imageExtensions: names,
        specialStyles: { type: 'object', additionalProperties: { type: 'string' } },
        regexps: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    warnings: names,
  },
} as const;
