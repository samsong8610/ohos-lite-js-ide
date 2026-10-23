/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { OhjsError } from '../../errors';
import { substituteTemplateText } from './substitute';
import type { OhSdkVersion, ProjectTemplateContext, RenderedProjectFile, TemplateManifest } from './types';

const TEXT_EXT = new Set(['.json', '.js', '.hml', '.css', '.md', '.txt', '.gitignore', '.tmpl']);

function sdkOverlayDir(sdkVersion: OhSdkVersion): string {
  return sdkVersion === '5.0.3' ? 'files.v5.0.3' : 'files.v6.1-lts';
}

function isTextFile(relPath: string): boolean {
  const base = relPath.endsWith('.tmpl') ? relPath.slice(0, -5) : relPath;
  const ext = path.extname(base);
  if (ext && TEXT_EXT.has(ext)) return true;
  if (base === 'gitignore' || base.endsWith('/gitignore') || base.endsWith('.gitignore')) return true;
  return false;
}

/** Maps template-relative paths to output paths (.tmpl suffix; gitignore file becomes dot-gitignore). */
export function mapTemplateOutputPath(relativePath: string): string {
  let rel = relativePath.replace(/\\/g, '/');
  if (rel.endsWith('.tmpl')) rel = rel.slice(0, -5);
  if (rel === 'gitignore') return '.gitignore';
  if (rel.endsWith('/gitignore')) {
    return rel.slice(0, rel.length - 'gitignore'.length) + '.gitignore';
  }
  return rel;
}

function walkFiles(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.gitkeep') continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(abs).isDirectory()) out.push(...walkFiles(abs, rel));
    else out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

function readManifest(templatesRoot: string, templateId: string): TemplateManifest {
  const manifestPath = path.join(templatesRoot, templateId, 'template.json');
  if (!fs.existsSync(manifestPath)) {
    throw new OhjsError('PRJ-SCAFFOLD-FAILED', `Missing template manifest: ${manifestPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (e) {
    throw new OhjsError('PRJ-SCAFFOLD-FAILED', `Invalid template.json for "${templateId}"`, {}, e);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new OhjsError('PRJ-SCAFFOLD-FAILED', `template.json for "${templateId}" must be an object`);
  }
  const m = parsed as TemplateManifest;
  if (m.id !== templateId) {
    throw new OhjsError(
      'PRJ-SCAFFOLD-FAILED',
      `template.json id "${String(m.id)}" does not match folder "${templateId}"`,
    );
  }
  if (!m.displayName) {
    throw new OhjsError('PRJ-SCAFFOLD-FAILED', `template "${templateId}" must define displayName`);
  }
  return m;
}

/** Lists installable templates under `templatesRoot` (each subfolder with template.json). */
export function listProjectTemplates(templatesRoot: string): TemplateManifest[] {
  if (!fs.existsSync(templatesRoot)) return [];
  const manifests: TemplateManifest[] = [];
  for (const name of fs.readdirSync(templatesRoot).sort()) {
    const dir = path.join(templatesRoot, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (name === 'common') continue;
    const manifestFile = path.join(dir, 'template.json');
    if (!fs.existsSync(manifestFile)) continue;
    manifests.push(readManifest(templatesRoot, name));
  }
  return manifests;
}

export function generateProjectJson(ctx: ProjectTemplateContext, moduleName: string): string {
  return (
    JSON.stringify(
      {
        sdkVersion: ctx.sdkVersion,
        module: moduleName,
        defaultDeviceProfile: ctx.deviceProfileId,
        deviceProfiles: [ctx.deviceProfileId],
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Merges shared + template + SDK overlay layers (later layers win) and applies variable substitution.
 * ARCHITECTURE §6.2: templates/common, id/common, id/files.v{sdk} overlay dirs.
 */
export function renderProjectTemplate(
  templatesRoot: string,
  templateId: string,
  ctx: ProjectTemplateContext,
): RenderedProjectFile[] {
  const manifest = readManifest(templatesRoot, templateId);
  const moduleName = manifest.moduleName ?? 'entry';

  const layers = [
    path.join(templatesRoot, 'common'),
    path.join(templatesRoot, templateId, 'common'),
    path.join(templatesRoot, templateId, sdkOverlayDir(ctx.sdkVersion)),
  ];

  const merged = new Map<string, string>();
  for (const layer of layers) {
    for (const rel of walkFiles(layer)) {
      merged.set(rel, path.join(layer, rel));
    }
  }

  const rendered: RenderedProjectFile[] = [];
  let hasProjectJson = false;

  for (const [rel, abs] of merged) {
    const outRel = mapTemplateOutputPath(rel);
    if (outRel === '.ohjs/project.json') hasProjectJson = true;
    const treatAsText = isTextFile(rel);
    if (treatAsText) {
      const raw = fs.readFileSync(abs, 'utf8');
      const text = rel.endsWith('.tmpl') ? substituteTemplateText(raw, ctx) : raw;
      rendered.push({ relativePath: outRel, content: new TextEncoder().encode(text) });
    } else {
      rendered.push({ relativePath: outRel, content: fs.readFileSync(abs) });
    }
  }

  if (!hasProjectJson) {
    rendered.push({
      relativePath: '.ohjs/project.json',
      content: new TextEncoder().encode(generateProjectJson(ctx, moduleName)),
    });
  }

  return rendered;
}
