/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Builds a tiny synthetic OpenHarmony source set (engine / loader / docs) on disk. */
export function writeMiniSources(variant: 'a' | 'b' = 'a'): {
  root: string;
  engine: string;
  loader: string;
  docs: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohjs-mini-'));
  const engine = path.join(root, 'engine');
  const loader = path.join(root, 'loader');
  const docs = path.join(root, 'docs');
  const w = (p: string, text: string): void => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  };
  const commit = variant === 'a' ? 'a'.repeat(40) : 'b'.repeat(40);
  w(path.join(engine, '.git/HEAD'), 'ref: refs/heads/main\n');
  w(path.join(engine, '.git/refs/heads/main'), `${commit}\n`);
  w(
    path.join(engine, '.git/packed-refs'),
    `# pack-refs\n${'c'.repeat(40)} refs/tags/v-annotated\n^${commit}\n`,
  );
  w(path.join(engine, '.git/config'), '[remote "origin"]\n\turl = https://example.invalid/engine.git\n');
  w(
    path.join(engine, 'frameworks/src/core/base/keys.h'),
    [
      'KEYWORD(DIV, div)',
      'KEYWORD(INPUT, input)',
      'KEYWORD(TABS, tabs)',
      'KEYWORD(FOO, foo)',
      'KEYWORD(GHOST, ghost)',
      'KEYWORD(BUTTON, button)',
      'KEYWORD(CHECKBOX, checkbox)',
      'KEYWORD(ID, id)',
      'KEYWORD(SHOW, show)',
      'KEYWORD(WIDTH, width)',
      'KEYWORD(BORDER_LEFT_COLOR, borderLeftColor)',
      'KEYWORD(CLICK, click)',
      'KEYWORD(FLEX_DIRECTION, flexDirection)',
      'KEYWORD(ROW, row)',
      'KEYWORD(VALUE, value)',
      'KEYWORD(CHECKED, checked)',
      'KEYWORD(CHANGE, change)',
      'KEYWORD(TYPE, type)',
      '#if (FEATURE_CAMERA_X == 1)',
      'KEYWORD(CAMERA_ONLY, cameraOnly)',
      '#endif',
      variant === 'b' ? 'KEYWORD(NAME, name)' : '',
    ].join('\n'),
  );
  w(
    path.join(engine, 'frameworks/module_manager/ohos_module_config.h'),
    [
      'const Module OHOS_MODULES[] = {',
      '    {"app", InitAppModule},',
      '    {"router", InitRouterModule},',
      '#if (FEATURE_SUPPORT_HTTP == 1)',
      '    {"fetch", InitFetchModule},',
      '#endif',
      '};',
    ].join('\n'),
  );
  w(
    path.join(engine, 'frameworks/targets/linux/acelite_config.h'),
    [
      '#ifndef ACELITE_CONFIG_H',
      '#define ACELITE_CONFIG_H',
      '#ifdef FEATURE_COMPONENT_CANVAS',
      '#error duplicate',
      '#else',
      '#define FEATURE_COMPONENT_CANVAS',
      '#endif',
      '#if defined(ENABLE_CAMERA_LITE)',
      '#define FEATURE_CAMERA_X 1',
      '#endif',
      variant === 'b' ? '#define FEATURE_COMPONENT_TABS' : '',
      '#define RUNTIME_MODE_FILE_PATH "/data/x"',
      '#endif',
    ].join('\n'),
  );
  w(
    path.join(engine, 'frameworks/src/core/components/component_factory.h'),
    `class ComponentFactory {
public:
    static Component* CreateComponent(uint16_t componentNameId, jerry_value_t options, jerry_value_t children)
    {
        Component* component = nullptr;
        switch (componentNameId) {
            case K_DIV:
                component = new DivComponent(options, children, manager);
                break;
            case K_INPUT: {
                uint16_t id = ParseType(options);
                if (id == K_CHECKBOX) {
                    component = new InputCheckboxComponent(options, children, manager);
                } else {
                    component = new InputButtonComponent(options, children, manager);
                }
                break;
            }
#if (FEATURE_COMPONENT_TABS == 1)
            case K_TABS:
                component = new TabsComponent(options, children, manager);
                break;
#endif
            case K_FOO:
                component = new FooComponent(options, children, manager);
                break;
            case K_UNREGISTERED:
                component = new BarComponent(options, children, manager);
                break;
            default:
                component = nullptr;
                break;
        }
        return component;
    }
};
`,
  );
  const comp = 'frameworks/src/core/components';
  w(
    path.join(engine, comp, 'component.cpp'),
    `void Component::RegisterNamedFunction(const char * const name, jerry_external_handler_t handler) {}
bool Component::SetCommonAttribute(uint16_t attrKeyId, jerry_value_t attrValue)
{
    switch (attrKeyId) {
        case K_ID: break;
        case K_SHOW: break;
        default: break;
    }
    return true;
}
bool Component::ApplyCommonStyle(const AppStyleItem *style)
{
    uint16_t stylePropNameId = GetStylePropNameId(style);
    switch (stylePropNameId) {
        case K_WIDTH: break;
        case K_BORDER_LEFT_COLOR: break;
        default: break;
    }
    return true;
}
bool Component::RegisterCommonEventListener(uint16_t eventTypeId, jerry_value_t funcValue)
{
    if (eventTypeId == K_CLICK) { return true; }
    return false;
}
`,
  );
  w(path.join(engine, comp, 'div_component.h'), 'class DivComponent : public Component {};');
  w(
    path.join(engine, comp, 'div_component.cpp'),
    `bool DivComponent::ApplyPrivateStyle(const AppStyleItem* style)
{
    uint16_t stylePropNameId = GetStylePropNameId(style);
    SetDirection(style, stylePropNameId);
    return true;
}
void DivComponent::SetDirection(const AppStyleItem* style, uint16_t stylePropNameId)
{
    uint16_t valueId = 0;
    switch (stylePropNameId) {
        case K_FLEX_DIRECTION: {
            switch (valueId) {
                case K_ROW: break;
                default: break;
            }
            break;
        }
        default: break;
    }
    Layout(valueId);
}
void DivComponent::Layout(uint16_t valueId)
{
    switch (valueId) { case K_ROW: break; default: break; }
}
`,
  );
  w(path.join(engine, comp, 'input_button_component.h'), 'class InputButtonComponent : public Component {};');
  w(
    path.join(engine, comp, 'input_button_component.cpp'),
    `const char * const InputButtonComponent::FUNC_FOCUS = "focus";
bool InputButtonComponent::SetPrivateAttribute(uint16_t attrKeyId, jerry_value_t attrValue)
{
    switch (attrKeyId) {
        case K_VALUE: break;
        case K_NOT_IN_KEYS: break;
        default: return false;
    }
    return true;
}
bool InputButtonComponent::RegisterPrivateEventListener(uint16_t eventTypeId, jerry_value_t funcValue, bool isStopPropagation)
{
    if (eventTypeId == K_CHANGE) { return true; }
    return false;
}
void InputButtonComponent::OnInit()
{
    RegisterNamedFunction(FUNC_FOCUS, Focus);
    RegisterNamedFunction(UNKNOWN_CONST, Other);
}
`,
  );
  w(
    path.join(engine, comp, 'input_checkbox_component.h'),
    'class InputCheckboxComponent : public InputButtonComponent {};',
  );
  w(
    path.join(engine, comp, 'input_checkbox_component.cpp'),
    `bool InputCheckboxComponent::SetPrivateAttribute(uint16_t attrKeyId, jerry_value_t attrValue)
{
    switch (attrKeyId) {
        case K_CHECKED: break;
#if (FEATURE_CAMERA_X == 1)
        case K_CAMERA_ONLY: break;
#endif
        default: break;
    }
    return true;
}
const MethodMap InputCheckboxComponent::methodMap_[] = {
    {"toggle", Toggle},
    {FUNC_FOCUS, Focus},
};
void InputCheckboxComponent::OnInit()
{
    RegisterNamedFunction(methodMap_[0].methodName, methodMap_[0].callback);
    RegisterNamedFunction("literal", Lit);
}
`,
  );
  w(path.join(engine, comp, 'tabs_component.h'), 'class TabsComponent : public Component {};');
  w(
    path.join(engine, comp, 'tabs_component.cpp'),
    'bool TabsComponent::SetPrivateAttribute(uint16_t attrKeyId, jerry_value_t v)\n{\n    switch (attrKeyId) { case K_VALUE: break; default: break; }\n    return true;\n}\n',
  );
  w(path.join(engine, comp, 'test/ignored_component.cpp'), 'garbage');
  // FooComponent has a header but no .cpp
  w(path.join(engine, comp, 'foo_component.h'), 'class FooComponent : public Component {};');

  w(
    path.join(loader, 'ace-loader/src/lite/lite-enum.js'),
    `const SPECIAL_STYLE = { ANIMATION_DELAY: 'animationDelay' };
const DEVICE_TYPE = { LITE: 'lite' };
const PLATFORM = { VERSION3: 'v3' };
const DEVICE_LEVEL = 'notatable';
const REGEXP_PNG = /\\.(png|jpg|bmp)$/i;
const REGEXP_JPEG = /\\.jpeg$/i;
module.exports = { SPECIAL_STYLE, DEVICE_TYPE, PLATFORM, DEVICE_LEVEL, REGEXP_PNG, REGEXP_JPEG };
`,
  );
  const d = path.join(docs, 'zh-cn/application-dev/reference/apis-arkui/arkui-js-lite');
  w(
    path.join(d, 'js-lite-components-container-div.md'),
    `# div

> **说明：**
> 该组件从从API version 4 开始支持。

## 子组件

支持。

## 属性

| 名称 | 类型 | 默认值 | 必填 | 描述 |
| -------- | -------- | -------- | -------- | -------- |
| id | string | - | 否 | 组件的唯一标识。 |

## 样式

| 名称 | 类型 | 默认值 | 必填 | 描述 |
| -------- | -------- | -------- | -------- | -------- |
| flex-direction | string | row | 否 | 主轴方向<br/>可选 |
| flex-wrap | string | nowrap | 否 | ${variant === 'a' ? '单行' : '单行或多行'} |
`,
  );
  w(
    path.join(d, 'js-lite-components-basic-input.md'),
    `# input

## 子组件

不支持。

## 属性

| 名称 | 类型 | 默认值 | 必填 | 描述 |
| -------- | -------- | -------- | -------- | -------- |
| type | string | button | 否 | 类型 |
| value | string | - | 否 | 值 |
| checked<sup>5+</sup> | boolean | false | 否 | 选中 |
| ${variant === 'b' ? 'name' : 'placeholder'} | string | - | 否 | x |

  **表1** Nested

| 名称 | 类型 | 描述 |
| -------- | -------- | -------- |
| nested | string | not a field |

## 事件

| 名称 | 参数 | 描述 |
| -------- | -------- | -------- |
| change | ChangeEvent | 变化 |

| 属性 | 类型 | 说明 |
| -------- | -------- | -------- |
| payload | string | not an event |

## 方法

| 名称 | 参数 | 描述 |
| -------- | -------- | -------- |
| focus | - | 聚焦 |
| toggle | - | 切换 |
`,
  );
  w(path.join(d, 'js-lite-components-container-ghost.md'), '# ghost\n\n## 属性\n');
  w(path.join(d, 'js-lite-components-canvas-canvasrenderingcontext2d.md'), '# ctx\n');
  w(
    path.join(d, 'js-lite-common-attributes.md'),
    `# 通用属性

## 常规属性

| 名称 | 类型 | 默认值 | 必填 | 描述 |
| -------- | -------- | -------- | -------- | -------- |
| id | string | - | 否 | 唯一标识 |
| style | string | - | 否 | 样式 |
| class | string | - | 否 | 类 |
| disabled | boolean | false | 否 | 禁用 |

## 渲染属性

| 名称 | 类型 | 默认值 | 描述 |
| -------- | -------- | -------- | -------- |
| for | Array | - | 循环 |
| if | boolean | - | 条件 |
| show | boolean | - | 显示 |
`,
  );
  w(
    path.join(d, 'js-lite-common-styles.md'),
    `# 通用样式

| 名称 | 类型 | 默认值 | 必填 | 描述 |
| -------- | -------- | -------- | -------- | -------- |
| width | &lt;length&gt; | - | 否 | 宽度 |
| border-[left\\|right]-color | &lt;color&gt; | - | 否 | 边框 |

  **表1** 颜色

| 枚举名称 | 对应颜色 |
| -------- | -------- |
| aliceblue | #f0f8ff |
`,
  );
  w(
    path.join(d, 'js-lite-common-events.md'),
    `# 通用事件

| 名称 | 参数 | 描述 |
| -------- | -------- | -------- |
| click | - | 点击 |
| longpress | - | 长按 |
`,
  );
  w(
    path.join(d, 'js-lite-framework-syntax-hml.md'),
    '<div for="{{list}}" tid="id"></div>\n<text elif="{{x}}"></text>\n',
  );
  return { root, engine, loader, docs };
}
