# DevEco Studio 3.1 Lite JS HAP 金样（Sam 2026-10-23）

## 安装产物路径

实际安装的 HAP：`entry/build/default/outputs/default/app/*.hap`  
旁路：`entry/build/default/outputs/default/pack.info`

金样文件：`/workspace/deveco-ref/entry-default.gold.hap`  
完整工程：`/workspace/deveco-ref/hellolite/`  
原始 zip：`/workspace/deveco-ref/hellolite-deveco31-ref.zip`

## 金样 HAP 内布局（必须对齐）

```
config.json
pack.info
assets/entry/resources.index
assets/entry/resources/base/media/icon.png
assets/entry/resources/base/media/icon_small.png
assets/js/MainAbility/app.js
assets/js/MainAbility/app.bc
assets/js/MainAbility/manifest.json
assets/js/MainAbility/i18n/en-US.json
assets/js/MainAbility/i18n/zh-CN.json
assets/js/MainAbility/pages/index/index.js
assets/js/MainAbility/pages/index/index.bc
assets/js/MainAbility/preview_css.json
assets/js/MainAbility/image_convert_result.txt
```

## 与当前 IDE ace-loader HAP 的主要差距（G2 UAT 样例）

- JS 落在 `assets/js/` 扁平树，缺 `MainAbility/` 能力目录
- 缺 `.bc`、`manifest.json`、`preview_css.json`、`assets/entry/resources.index`、icon 资源
- `config.json` 缺 `app.apiVersion`、ability `srcPath`/`mainAbility`/资源 id；ability/js name 为 `default` 而非与 srcPath 对齐
- `pack.info` 结构与 DevEco（deviceType/apiVersion/packages）不一致
- 输出路径应为模块下 `…/outputs/default/app/<module>-default.hap`（或等价可部署路径），部署应指向该文件

## 验收

对照金样：目录集合 + 关键 config/pack 字段；主机侧 zip 清单 diff 测试；再请 Sam 装板/试用确认。
