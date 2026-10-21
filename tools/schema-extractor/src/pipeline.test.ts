/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadComponentsSchema } from '@ohjs/schemas';
import { expandVars, missingSources, parseSourcesConfig, type SourcesConfig } from './config';
import { diffSchemas, renderDiffMarkdown } from './diff';
import { generateSchema } from './generate';
import { buildOutputs, runCheck, runGenerate } from './run';
import { writeMiniSources } from '../test/mini-sources';

const a = writeMiniSources('a');
const b = writeMiniSources('b');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-out-'));
afterAll(() => {
  for (const d of [a.root, b.root, out]) fs.rmSync(d, { recursive: true, force: true });
});

const cfg = (): SourcesConfig => ({
  versions: [
    {
      ohVersion: '5.0.3',
      provisional: false,
      target: 'linux',
      engine: a.engine,
      loader: a.loader,
      docs: a.docs,
    },
    {
      ohVersion: '6.1-LTS',
      provisional: true,
      provisionalReason: 'unverified',
      target: 'linux',
      engine: b.engine,
      loader: b.loader,
      docs: b.docs,
    },
  ],
  diff: [{ from: '5.0.3', to: '6.1-LTS' }],
});

describe('sources config', () => {
  it('expands ${VAR} and ${VAR:-default}', () => {
    expect(expandVars('${A}/x/${B:-dflt}', { A: '/a' })).toBe('/a/x/dflt');
    expect(expandVars('${B:-dflt}', { B: '' })).toBe('dflt');
    expect(() => expandVars('${NOPE}', {})).toThrow('environment variable NOPE is not set');
  });
  it('parses and validates', () => {
    const c = parseSourcesConfig(
      JSON.stringify({
        versions: [
          {
            ohVersion: '1',
            target: 'linux',
            engine: '${R}/e',
            loader: 'l',
            docs: 'd',
            provisional: true,
            provisionalReason: 'r',
          },
          { ohVersion: '2', target: 'linux', engine: 'e', loader: 'l', docs: 'd' },
        ],
        diff: [{ from: '1', to: '2' }],
      }),
      { R: '/r' },
    );
    expect(c.versions[0]).toEqual({
      ohVersion: '1',
      provisional: true,
      provisionalReason: 'r',
      target: 'linux',
      engine: '/r/e',
      loader: 'l',
      docs: 'd',
    });
    expect(c.versions[1]!.provisional).toBe(false);
    expect(
      parseSourcesConfig(
        JSON.stringify({ versions: [{ ohVersion: '1', target: 't', engine: 'e', loader: 'l', docs: 'd' }] }),
        {},
      ).diff,
    ).toEqual([]);
    expect(() => parseSourcesConfig('{}', {})).toThrow(/non-empty array/);
    expect(() => parseSourcesConfig(JSON.stringify({ versions: [{ ohVersion: 1 }] }), {})).toThrow(
      /versions\[0\]\.ohVersion/,
    );
    expect(() =>
      parseSourcesConfig(
        JSON.stringify({
          versions: [{ ohVersion: '1', target: 't', engine: 'e', loader: 'l', docs: 'd' }],
          diff: [{ from: '1', to: '9' }],
        }),
        {},
      ),
    ).toThrow(/unknown version/);
  });
  it('the committed sources.json parses', () => {
    const text = fs.readFileSync(path.join(__dirname, '../sources.json'), 'utf8');
    const c = parseSourcesConfig(text, {});
    expect(c.versions.map((v) => [v.ohVersion, v.provisional])).toEqual([
      ['5.0.3', false],
      ['6.1-LTS', true],
    ]);
  });
  it('missingSources', () => {
    expect(missingSources(cfg().versions[0]!)).toEqual([]);
    expect(missingSources({ ...cfg().versions[0]!, docs: '/nonexistent/docs' })).toEqual([
      '/nonexistent/docs',
    ]);
  });
});

describe('diff', () => {
  it('reports component, field, doc, feature and common differences', () => {
    const sa = generateSchema(cfg().versions[0]!);
    const sb = generateSchema(cfg().versions[1]!);
    const d = diffSchemas(sa, sb);
    expect(d.componentAvailability).toEqual(['tabs: disabled-by-feature → code-doc-missing']);
    expect(d.features).toEqual(['FEATURE_COMPONENT_TABS: undefined → true']);
    expect(d.fields['div']).toBeUndefined();
    expect(d.fields['tabs']!.attributes!.changed).toEqual(['value: disabled-by-feature → code-doc-missing']);
    const md = renderDiffMarkdown(d, sa, sb);
    expect(md).toContain('# ArkUI.Lite component schema diff: 5.0.3 → 6.1-LTS');
    expect(md).toContain('⚠ 6.1-LTS is provisional: unverified');
    expect(md).toContain('engine=aaaaaaaaaaaa (v-annotated)');
    expect(md).toContain('loader=unknown');
    expect(md).toContain('### <tabs>');
  });
  it('detects added/removed components and fields and doc edits', () => {
    const sa = generateSchema(cfg().versions[0]!);
    const sb = structuredClone(sa);
    delete sb.components['foo'];
    sb.components['new'] = { ...sa.components['div']!, tag: 'new' };
    sb.components['div']!.styles['extra'] = { availability: 'code', evidence: [] };
    delete sb.components['div']!.styles['flex-direction'];
    sb.components['input']!.attributes['value']!.doc = 'changed';
    sb.components['input']!.attributes['checked']!.doc = undefined as unknown as string;
    delete sb.components['input']!.attributes['checked']!.doc;
    sb.components['input']!.attributes['cameraOnly']!.doc = 'new doc';
    delete sb.common.attributes['ref'];
    sb.aceLoader.imageExtensions = ['png', 'gif'];
    const d = diffSchemas(sa, sb);
    expect(d.componentsAdded).toEqual(['new']);
    expect(d.componentsRemoved).toEqual(['foo']);
    expect(d.fields['div']!.styles).toEqual({ added: ['extra'], removed: ['flex-direction'], changed: [] });
    expect(d.fields['input']!.attributes!.docChanged).toEqual([
      'cameraOnly (newly documented)',
      'checked (doc removed)',
      'value (doc text changed)',
    ]);
    expect(d.common.attributes!.removed).toEqual(['ref']);
    expect(d.imageExtensions).toEqual({ added: ['gif'], removed: ['bmp', 'jpg'], changed: [] });
    const md = renderDiffMarkdown(d, sa, sb);
    expect(md).toContain('- added: `new`');
    expect(md).toContain('- removed: `foo`');
    expect(md).toContain('- attributes removed: `ref`');
    expect(md).toContain('image extensions added: `gif`');
  });
  it('renders the no-difference case', () => {
    const sa = generateSchema(cfg().versions[0]!);
    const md = renderDiffMarkdown(diffSchemas(sa, sa), sa, sa);
    expect(md).toContain('No component added, removed or changed availability.');
    expect(md).toContain('No attribute / style / event / method differences.');
    expect(md).toContain('No differences in accepted image extensions.');
  });
});

describe('generate / check', () => {
  it('writes outputs that the schemas loader accepts, and check passes', () => {
    const logs: string[] = [];
    const r = runGenerate(cfg(), out, (m) => logs.push(m));
    expect(r.files.sort()).toEqual([
      'diff-5.0.3-6.1-lts.md',
      'sources.lock.json',
      'v5.0.3/components.json',
      'v6.1-lts/components.json',
    ]);
    expect(logs[0]).toMatch(/^5\.0\.3: 4 components, \d+ warnings$/);
    expect(loadComponentsSchema('6.1-LTS', out).provisional).toBe(true);
    const lock = JSON.parse(fs.readFileSync(path.join(out, 'sources.lock.json'), 'utf8'));
    expect(lock['5.0.3'][0].commit).toBe('a'.repeat(40));
    expect(runCheck(cfg(), out)).toEqual({ files: [], skipped: [], errors: [] });
  });
  it('check reports stale and missing files', () => {
    fs.appendFileSync(path.join(out, 'v5.0.3/components.json'), ' ');
    fs.rmSync(path.join(out, 'diff-5.0.3-6.1-lts.md'));
    const r = runCheck(cfg(), out);
    expect(r.files).toEqual(['v5.0.3/components.json']);
    expect(r.errors).toEqual([
      'v5.0.3/components.json: out of date (run pnpm schema:generate)',
      'diff-5.0.3-6.1-lts.md: missing (run pnpm schema:generate)',
    ]);
  });
  it('skips versions whose sources are missing (no lock, no diff)', () => {
    const c = cfg();
    c.versions[1]!.engine = '/nonexistent/engine';
    const { outputs, skipped } = buildOutputs(c);
    expect([...outputs.keys()]).toEqual(['v5.0.3/components.json']);
    expect(skipped).toEqual([
      '6.1-LTS: missing /nonexistent/engine',
      'diff 5.0.3 → 6.1-LTS: a side was skipped',
    ]);
  });
});
