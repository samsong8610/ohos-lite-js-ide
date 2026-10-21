# @ohjs/language-server

Language server (LSP) for ArkUI.Lite JS projects (ARCHITECTURE §7, PLAN M1-7, FR-LANG-004/006/012).
It runs as a separate Node process (`node out/main.js --stdio`, or over IPC from the VS Code client)
and can be driven by any LSP client.

Implemented so far (M1-7 batch 1):

- incremental document sync for HML / CSS / JS documents (features: HML only for now);
- fault-tolerant HML parser with exact offsets (`src/hml/parser.ts`);
- `SchemaRegistry`: loads `packages/schemas/<version>/components.json` lazily and switches SDK
  versions at runtime (`ohjs/sdkChanged` → `ohjs/sdkStatus`, all open documents re-validated);
- HML completion: component tags (filtered by the parent's child constraint and by FEATURE macros),
  attributes, directives, events (`on<event>` / `@<event>`), closing tags;
- HML diagnostics with rule IDs, severities configurable via `ohjs.lang.rules`, and
  `<!-- ohjs-disable [rule…] -->` / `<!-- ohjs-disable-next-line [rule…] -->` comments.

| Rule                                | Default |
| ----------------------------------- | ------- |
| `hml/syntax`                        | error   |
| `hml/unknown-component`             | error   |
| `hml/component-disabled-by-feature` | error   |
| `hml/unknown-attribute`             | error   |
| `hml/attribute-disabled-by-feature` | warning |
| `hml/doc-only-attribute`            | warning |
| `hml/unknown-event`                 | error   |
| `hml/doc-only-event`                | warning |
| `hml/unknown-event-modifier`        | error   |
| `hml/invalid-child`                 | error   |
| `hml/for-with-if`                   | warning |
| `hml/empty-event-handler`           | warning |

## Initialization options

```jsonc
{ "sdkVersion": "5.0.3", "schemaDir": "<dir with v*/components.json>", "rules": {}, "debounceMs": 200 }
```
