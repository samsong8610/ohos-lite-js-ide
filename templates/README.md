# templates

Project templates for the new-project wizard (M1-9: empty, list-demo, …). See ARCHITECTURE.md §6.2.

- `common/` — files copied into every generated project.
  - `gitignore` is written as `.gitignore` (npm/vsce drop dot-files named `.gitignore` from packages, so it is stored without the dot). It ignores the files the extension regenerates under `.ohjs/` (`types/`, `jsconfig.base.json`); `.ohjs/project.json` stays versioned. The extension never edits an existing user `.gitignore`.
- `empty/common/entry/src/main/resources/` — FA lite `string.json` (matches `$string:app_name` in `config.json.tmpl`) and a placeholder `icon.png` so ace-loader / restool can compile `resources.index`.
