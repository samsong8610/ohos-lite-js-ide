# templates

Project templates for the new-project wizard (M1-9: empty, list-demo, …). See ARCHITECTURE.md §6.2.

- `common/` — files copied into every generated project.
  - `gitignore` is written as `.gitignore` (npm/vsce drop dot-files named `.gitignore` from packages, so it is stored without the dot). It ignores the files the extension regenerates under `.ohjs/` (`types/`, `jsconfig.base.json`); `.ohjs/project.json` stays versioned. The extension never edits an existing user `.gitignore`.
  - `entry/src/main/js/default/common/back.png` — the 24×24 nav back icon referenced by every template page as `/common/back.png`.
- `common/entry/src/main/resources/` — shared by every template: FA lite `string.json` (`$string:app_name`) and `base/media/icon.png` (`$media:icon`). Packaged `config.json` keeps that `$media:icon` reference and adds `iconId`, matching a DevEco HAP.

## Page shell (all templates)

Every page uses the same top nav so generated projects look and behave like a DevEco run:

```
.container                 column, {{display.width}}×{{display.height}}
  .page-head               row, {{px 48}}, #1a1a1a
    .back-btn              onclick="onExit" → app.terminate()
    .head-title            {{px 928}}, centered {{ title }}
    .back-spacer           {{px 48}}, keeps the title centered
  .head-line               1px #eeeeee separator
  .page-content            {{display.contentHeight}} (screen height − head − 1)
```

Keep `.head-title`, `.back-btn` and `.back-spacer` together: the spacer balances the icon so the title stays centered. The three widths add up to `{{display.width}}`, so nothing needs flex maths.

ArkUI.Lite has **no `flex` style** (`flex-grow`, `flex: 1` are ignored on the device — only `flexDirection`/`flexWrap` exist). Size boxes explicitly with `{{px N}}` / `{{display.*}}` instead.
