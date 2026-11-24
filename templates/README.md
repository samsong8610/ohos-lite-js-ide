# templates

Project templates for the new-project wizard (M1-9: empty, list-demo, …). See ARCHITECTURE.md §6.2.

- `common/` — files copied into every generated project.
  - `gitignore` is written as `.gitignore` (npm/vsce drop dot-files named `.gitignore` from packages, so it is stored without the dot). It ignores the files the extension regenerates under `.ohjs/` (`types/`, `jsconfig.base.json`); `.ohjs/project.json` stays versioned. The extension never edits an existing user `.gitignore`.
- `common/entry/src/main/resources/` — shared by every template: FA lite `string.json` (`$string:app_name`) and `base/media/icon.png` (`$media:icon`). Packaged `config.json` keeps that `$media:icon` reference and adds `iconId`, matching a DevEco HAP.
