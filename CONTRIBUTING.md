# Contributing

Thanks for contributing to ohos-lite-js-ide. By contributing you agree your work is licensed under Apache-2.0.

## Ground rules

1. **TypeScript strict**, ESLint and Prettier must pass: `pnpm run lint`.
2. Every source file starts with the Apache-2.0 header:
   ```ts
   /*
    * Copyright (c) 2026 ohos-lite-js-ide contributors
    * SPDX-License-Identifier: Apache-2.0
    */
   ```
   (`scripts/check-license-headers.mjs` checks this.)
3. **Platform abstraction:** never import `child_process` or branch on `process.platform` / `os.platform()`
   in business code. Go through `IPlatform` / `IProcessRunner` (`@ohjs/core`).
4. `packages/core` must not import `vscode`.
5. Every external command has a timeout and supports cancellation; keep raw output in errors (`OhjsError`).
6. Device specifics (paths, ports, commands, resolution, FEATURE macros) belong in **device profiles**, never in code.
7. Version differences (5.0.3 vs 6.1-LTS) belong in generated **schema data**, never in code.

## Tests

- Unit tests next to the code (`*.test.ts`, Vitest). Run `pnpm run test:coverage`.
- Coverage gates: overall ≥ 80% lines; hdc output parsers, schema extraction & validation ≥ 90%.
- Anything that talks to hdc is tested against `packages/test-kit/mock-hdc`, never a real device in CI.
- Real-device results must not be fabricated; attach the result JSON produced by the local scripts.

## Schemas

Schemas under `packages/schemas/v*/` are generated. Do not edit them by hand; change the extractor or
`tools/schema-extractor/overrides/` and run `pnpm run schema:generate` (requires the OpenHarmony sources,
see `tools/schema-extractor/README.md`).

## Commits / PRs

- One logical change per commit; reference requirement IDs (e.g. `FR-DEP-007`, `I-1`) in the message.
- PRs must pass the AtomGit pipeline; Windows changes should also pass the GitHub mirror matrix.
