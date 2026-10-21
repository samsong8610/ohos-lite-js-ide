/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { detectFromConfigJson, stripJsonComments } from './project-detector';

describe('detectFromConfigJson (FR-PRJ-003)', () => {
  it.each([
    ['js ability', { module: { abilities: [{ name: 'Main', srcLanguage: 'js' }] } }, true],
    ['module.js[]', { module: { js: [{ name: 'default', pages: ['pages/index/index'] }] } }, true],
    ['ets ability', { module: { abilities: [{ srcLanguage: 'ets' }] } }, false],
    ['empty js[]', { module: { js: [] } }, false],
    ['no module', { app: {} }, false],
    ['array root', [], false],
  ])('%s', (_n, json, expected) => {
    expect(detectFromConfigJson(JSON.stringify(json)).isProject).toBe(expected);
  });

  it('rejects invalid JSON with a reason', () => {
    const r = detectFromConfigJson('{ nope');
    expect(r.isProject).toBe(false);
    expect(r.reason).toMatch(/not valid JSON/);
  });

  it('tolerates comments', () => {
    const text = '{ // c\n "module": { /* x */ "js": [{"name":"default"}] } }';
    expect(detectFromConfigJson(text).isProject).toBe(true);
  });

  it('keeps comment-like text inside strings', () => {
    expect(stripJsonComments('{"a":"//x\\"/*y*/"}')).toBe('{"a":"//x\\"/*y*/"}');
  });
});
