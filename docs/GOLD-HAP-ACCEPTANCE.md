# DevEco Studio 3.1 Lite JS HAP 金样（Sam 2026-10-23）

## 优先级

**首要**：HAP **zip 内成员路径 + 文件体**（与 DevEco 安装包一致）。  
**次要**：主机侧输出目录（`entry/build/default/outputs/default/app/*.hap` 等）便于对齐 DevEco，但不替代内容验收。

金样文件：`packages/build/test/fixtures/gold-hap/entry-default.gold.hap`  
DevEco 工程参考：`hellolite-deveco31-ref.zip`（`loader_out_lite` / `restool` 产物）

## 金样 HAP 内布局（路径集合）

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

## 内容级魔数与约束

| 成员                           | 要求                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `*.bc`                         | 以 Jerry lite 快照 magic **`JRRY1`** 开头（hex `4a52525931000000`），非占位 stub                      |
| `assets/entry/resources.index` | 以 **`Restool `** 开头（hex `526573746f6f6c20`），由 SDK `restool` 编译；IDE 通过 `OHJS_RESTOOL` 调用 |
| `*.png`                        | 标准 PNG magic `89504e47…`                                                                            |
| `config.json` / `pack.info`    | 字段与金样一致（apiVersion、mainAbility、资源 id、packages 等）                                       |
| `app.js` / `index.js`          | 与 DevEco ace-loader 产物一致（CI 用 `hellolite-deveco-loader-out` 快照对照金样）                     |
| `preview_css.json`             | `entry` 键规范化后形状一致（路径/host 差异可忽略）                                                    |

## IDE 构建链

1. **ace-loader**（upstream webpack + lite snapshot）→ 真实 `.bc` + 编译 JS；打包阶段**不再**注入 stub bytecode。
2. **restool**（`OHJS_RESTOOL` → SDK `toolchains/restool`）→ 真实 `resources.index`。
3. CI：`restool-shim` 仅用于 hellolite 金样表；fake ace-loader **重放** DevEco `loader_out_lite` 目录（真实 JRRY1）。

## 自动化验收

`packages/build/src/hap-gold.test.ts`：路径集合、魔数、尺寸区间、hellolite 与金样逐字节对比（JS/bc/index/图标等），以及 config/pack 结构对比。

## 人工验收

Sam 装板 / 试用确认。
