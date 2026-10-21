/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where a file sits in an FA (Lite) module: `<module>/src/main/js/<jsName>/<rel>` (ARCHITECTURE §6).
 * Works on URI strings, so it is path-separator independent (Windows file URIs use '/').
 */
export interface ModuleLayout {
  /** `…/src/main/` (with trailing slash) */
  mainUri: string;
  configUri: string;
  jsName: string;
  /** `…/src/main/js/<jsName>/` */
  jsRootUri: string;
  i18nDirUri: string;
  /** path below the js root, '/'-separated */
  rel: string;
  /** `pages/index/index` for `pages/index/index.hml|js|css`, else undefined */
  page?: string;
}

export function moduleLayout(uri: string): ModuleLayout | undefined {
  const m = /^(.*\/src\/main\/)js\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) return undefined;
  const [, mainUri, jsName, rel] = m as unknown as [string, string, string, string];
  const jsRootUri = `${mainUri}js/${jsName}/`;
  const p = /^(pages\/.+)\.(hml|js|css|less)$/.exec(rel);
  return {
    mainUri,
    configUri: `${mainUri}config.json`,
    jsName,
    jsRootUri,
    i18nDirUri: `${jsRootUri}i18n/`,
    rel,
    ...(p ? { page: p[1] } : {}),
  };
}

/** `…/src/main/config.json` → `…/src/main/` */
export function mainUriOfConfig(uri: string): string | undefined {
  const m = /^(.*\/src\/main\/)config\.json$/i.exec(uri);
  return m ? m[1] : undefined;
}
