/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ProjectTemplateContext } from './types';

/** Design width for `{{px N}}` scaling (ARCHITECTURE §6.2). */
export const PX_DESIGN_WIDTH = 1024;

export function scalePx(designPx: number, targetWidth: number): number {
  return Math.round((designPx * targetWidth) / PX_DESIGN_WIDTH);
}

const PX_RE = /\{\{px\s+(\d+(?:\.\d+)?)\s*\}\}/g;

/** Substitutes wizard variables and scaled px tokens in template text. */
export function substituteTemplateText(text: string, ctx: ProjectTemplateContext): string {
  let out = text.replace(PX_RE, (_, raw: string) => String(scalePx(Number(raw), ctx.display.width)));
  const vars: Record<string, string> = {
    bundleName: ctx.bundleName,
    vendor: ctx.vendor,
    sdkVersion: ctx.sdkVersion,
    'display.width': String(ctx.display.width),
    'display.height': String(ctx.display.height),
    deviceProfileId: ctx.deviceProfileId,
  };
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}
