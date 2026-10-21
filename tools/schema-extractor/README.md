# @ohjs/schema-extractor

Extracts the versioned ArkUI.Lite (JS lite) component schema from OpenHarmony sources
(ARCHITECTURE §7.3/§7.4, PLAN M1-5, FR-LANG-003). Output lands in `packages/schemas/`:

| File                       | Content                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `v5.0.3/components.json`   | OpenHarmony 5.0.3 data pack (`provisional: false`)                  |
| `v6.1-lts/components.json` | OpenHarmony 6.1-LTS data pack (`provisional: true`, temporary data) |
| `diff-5.0.3-6.1-lts.md`    | version diff report                                                 |
| `sources.lock.json`        | commit / tag / remote of every source checkout used                 |

## Pipeline

1. `keys.h` → keyword enum ↔ runtime key (`KEYWORD(ENUM, key)`), with `#if FEATURE_*` guards.
2. `targets/<target>/acelite_config.h` → feature switches (`true` / `false` / `conditional`).
3. `component_factory.h` → the components the runtime can create, `type` variants, feature guards.
4. component implementations (`SetPrivateAttribute`, `ApplyPrivateStyle`, `RegisterPrivateEventListener`,
   helpers they hand the key to, `RegisterNamedFunction` / `methodMap_`) and the `Component` base class for the
   common attributes / styles / events.
5. ace-loader `lite-enum.js`, evaluated in an isolated `vm` context (no `require`, no `process`).
6. arkui-js-lite reference docs (tables, `<sup>N+</sup>`, `a-[b|c]` patterns, child components).
7. merge → availability per field: `code`, `code-doc-missing` (implemented, undocumented — warn only),
   `disabled-by-feature`, `conditional`, `framework`; documented-but-unimplemented names go to `docOnly`.
   Every fact carries `file:line` evidence.

The code is the source of truth; docs only add descriptions and `since`. Git provenance is read from `.git`
directly (no git process).

## Usage

```sh
pnpm schema:generate   # regenerate packages/schemas
pnpm schema:check      # regenerate in memory and compare; versions whose sources are absent are skipped with a warning
```

Source locations are in `sources.json`; override with `OHJS_SRC_5_0_3`, `OHJS_DOCS_5_0_3`, `OHJS_SRC_6_1`.

## Known limits

- Regex/brace scanning, not a C++ parser: unusual code shapes may be missed (warnings are recorded in the data pack).
- Only the `linux` target config is read; a product-level `ace_lite_config` override is not modelled.
- Nested option tables (e.g. chart `options`) are not modelled as fields.
