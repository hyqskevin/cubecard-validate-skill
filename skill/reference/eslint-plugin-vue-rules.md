# eslint-plugin-vue 关键规则 · 前端归档

> 整理自 `eslint-plugin-vue` 官方规则集（eslint.vuejs.org/rules/），针对**前端 + ACT Cube 卡片**
> 视角筛选最相关的规则。每条给出描述、对应方案与使用清单。
>
> - 抓取日期：2026-09-10
> - 来源：https://eslint.vuejs.org/rules/
> - ACT DSL 是 Vue 2.x 语法的受限子集，许多 vue/* 规则在卡片上不适用（无 props / emits / slot 等），需结合卡片形态甄别。

---

## 一、Priority A: Essential（防错类，必启用）

| 规则 ID | 描述 | 对应方案 | ACT 卡片使用清单 |
|---------|------|----------|-----------------|
| `vue/multi-word-component-names` | 组件名应多词（避免与 HTML 标签冲突） | 文件名/注册名多词 | 卡片命名已是多词（`order-list`），保持 |
| `vue/no-async-in-computed-properties` | getter 不应异步 | getter 只做派生 | 卡片 getter 内不放 Promise |
| `vue/no-child-content` | 元素若有 `v-html`/`v-text` 子内容会被覆盖 | 子内容放在属性里 | 卡片禁用 v-html/v-text，仅用 `{{}}` |
| `vue/no-computed-properties-in-data` | data 中不应访问 computed | data 必须是初始值 | `beforeCreate` 中可设 data，禁止访问 getter |
| `vue/no-duplicate-attributes` | 模板中属性不能重复 | 合并/删除 | 卡片刻意检查 |
| `vue/no-parsing-error` | 模板解析错误 | 修正语法 | V10 三段完整性已部分覆盖 |
| `vue/no-mutating-props` | 不能改 props | props 只读 | 卡片没有 props，跳过 |
| `vue/no-side-effects-in-computed-properties` | getter 不应有副作用 | getter 只读 data | 卡片 getter 不修改 this |
| `vue/no-template-key` | `<template>` 上不放 key | key 应在 v-for 子元素上 | V6 已强制 :key |
| `vue/no-textarea-mustache` | `<textarea>` 内不用 `{{}}` | 用 `:value` | 卡片无 textarea |
| `vue/no-unused-components` | 组件声明后未使用应删除 | 删注册 | 卡片只用 6 个内置 |
| `vue/no-use-v-if-with-v-for` | 同一元素不要同时用 v-if + v-for | 用计算属性过滤 | V6/V7 已互斥提醒 |
| `vue/no-v-html` | **禁用 v-html 防 XSS** | 用 `{{}}` 或 `external-richtext` | **V12 已覆盖** |
| `vue/no-v-text-v-html-on-component` | 组件上禁用 v-text/v-html | 用 props/slot | 卡片适用 |
| `vue/require-v-for-key` | v-for 必须配 :key | 强制 :key | V6 已要求 :key |
| `vue/return-in-computed-property` | getter 必须有 return | 补 return | 卡片 getter 模板 |
| `vue/use-v-on-exact` | 同一元素绑定多个事件时用 .exact | 加 .exact | 卡片按键组合时使用 |
| `vue/valid-attribute-name` | 属性名合法 | 修正命名 | 卡片刻意检查 |
| `vue/valid-template-root` | 模板根合法 | 卡片 `<template>` 根是 `<div>`/`<text>`/`<scroll-view>` 等 | 卡片刻意检查 |
| `vue/valid-v-bind` / `valid-v-on` / `valid-v-if` / `valid-v-for` / `valid-v-show` / `valid-v-model` / `valid-v-cloak` / `valid-v-pre` / `valid-v-once` | 指令合法 | 按指令规范 | 卡片渲染单测层 E2E 已覆盖 |
| `vue/valid-v-html` | 合法 v-html（已被 `no-v-html` 覆盖） | 同上 | **V12 已覆盖** |
| `vue/valid-v-text` | 合法 v-text | 卡片基本不用 | 跳过 |
| `vue/no-deprecated-*`（一堆 Vue3 弃用项） | 卡片是 Vue 2 子集，无 Vue3 弃用 | 跳过大部分 | 跳过 |
| `vue/no-shared-component-data` | 组件 data 必须是函数 | 卡片 data 是对象（DSL 简化） | 在 ACT 引擎层允许，单独 ESLint 配置可豁免 |
| `vue/require-component-is` | `<component>` 必须 `v-bind:is` | 卡片用固定标签，`<component>` 不用 | 跳过 |

## 二、Priority B: Strongly Recommended（强烈推荐）

| 规则 ID | 描述 | ACT 卡片使用清单 |
|---------|------|-----------------|
| `vue/attribute-hyphenation` | 自定义组件 attribute 命名风格（kebab-case vs camelCase） | 卡片内置标签用 `@click`/`:value`，已统一 |
| `vue/component-definition-name-casing` | 组件定义名 PascalCase | 卡片无子组件，跳过 |
| `vue/html-closing-bracket-newline` | 闭合括号前换行 | 格式类，按团队风格 |
| `vue/html-indent` | 模板缩进 | 风格类 |
| `vue/html-self-closing` | 自闭合风格 | 风格类 |
| `vue/max-attributes-per-line` | 同行最多属性数 | 风格类 |
| `vue/no-multi-spaces` | 多个空格 | 风格类 |
| `vue/no-template-shadow` | 模板变量遮蔽外部 | 卡片刻意 |
| `vue/one-component-per-file` | 单组件单文件 | 卡片本身就是单文件 |
| `vue/prop-name-casing` | props 命名风格 | 卡片无 props |
| `vue/v-on-event-hyphenation` | 自定义事件命名 | 卡片无自定义事件 |
| `vue/v-on-style` | `v-on` 简写 `@` | 卡片用 `@click` 简写 |
| `vue/v-bind-style` | `v-bind` 简写 `:` | 卡片用 `:value` 简写 |

## 三、Priority C: Recommended（推荐启用）

| 规则 ID | 描述 | ACT 卡片使用清单 |
|---------|------|-----------------|
| `vue/attributes-order` | 模板属性顺序 | 风格类 |
| `vue/block-order` | 块顺序（template/script/style） | 卡片固定顺序（V10 已覆盖） |
| `vue/no-lone-template` | 不必要的 `<template>` | 卡片顶层是 `<template>`，需 IGNORE |
| `vue/no-required-prop-with-default` | 必填 prop 不应给默认值 | 卡片无 props |
| `vue/no-v-html` | **禁用 v-html** | **V12 已覆盖** |
| `vue/order-in-components` | 组件选项顺序 | 卡片 data→lifecycle→methods 顺序 |
| `vue/this-in-template` | 模板禁用 `this` | 卡片事件回调例外（`@click="onClick"`），其他要警觉 |
| `vue/no-deprecated-*`（Vue3 弃用） | 卡片不用 Vue3 | 跳过 |

## 四、Uncategorized（按需启用）

| 规则 ID | 描述 | ACT 卡片使用清单 |
|---------|------|-----------------|
| `vue/block-lang` | `<script>` / `<style>` 限制 lang | 卡片 lang 默认 js / css |
| `vue/component-api-style` | 组件 API 风格（Options / Composition） | 卡片用 Options API 固定 |
| `vue/component-name-in-template-casing` | 模板中组件名 PascalCase | 卡片不用自定义组件 |
| `vue/custom-event-name-casing` | 自定义事件 kebab-case | 卡片无 |
| `vue/html-button-has-type` | `<button>` 必须显式 type | 卡片无 button |
| `vue/no-unregistered-components` | 禁止未注册组件 | 卡片只用内置 |
| `vue/v-on-event-hyphenation` | 自定义事件连字符 | 卡片无 |

## 五、与本 Skill 已实现规则的映射

| eslint-plugin-vue 规则 | 本 Skill 对应实现 | 备注 |
|------------------------|------------------|------|
| `vue/no-v-html` | **V12** | XSS |
| `vue/no-mutating-props` | ACT DSL 无 props（只有 data） | 跳过 |
| `vue/require-v-for-key` | **V6** + 已要求 :key | :key 必填 |
| `vue/no-use-v-if-with-v-for` | **V6/V7** | 互斥提醒 |
| `vue/return-in-computed-property` | 已有 E2E 测试断言 | 引擎层 |
| `vue/no-side-effects-in-computed-properties` | 引擎层保证 | 引擎层 |
| `vue/valid-template-root` | **V10** | template/script/style 完整性 |
| `vue/no-async-in-computed-properties` | 引擎层 v14 业务完备覆盖 | 引擎层 |
| `vue/comment-directive` | 跳过 | ACT 编译产物不带注释指令 |
| `vue/no-parsing-error` | **V10 + 引擎** | 三段解析错误 |
| `vue/no-unused-components` | 跳过 | 卡片只允许内置组件 |

> ACT 是受限 Vue DSL（无 props / emits / slot / 自定义组件），多数 vue/* 规则仅适用于宿主工程或大卡片工程，对单文件卡片来说，覆盖关键防错类即可。

## 六、卡片 ESLint 接入方案

由于本 Skill 的卡片源码通过 `extractScript` 抽取 `<script>` 后用 `eslint/plugin.js` 自有规则 lint，且 `import toast from '...'` 也已支持，建议接入 `eslint-plugin-vue` 仅作为**工程级代码评审参考**（覆盖 `vue/no-v-html` 等关键防错类），卡片单文件仍走本 Skill 自身 V12 等规则。

```js
// eslint.config.mjs（用于 review 工程，非卡片直接 lint）
import cubePlugin from '../eslint/plugin.js';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  {
    files: ['cards/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { cube: cubePlugin, vue },
    rules: {
      'cube/no-unknown-lifecycle': 'error',
      'cube/no-magic-event': 'error',
      'cube/no-shadow-data': 'warn',
      'cube/no-magic-color-hex': 'warn',
      'vue/no-v-html': 'error',                  // XSS
      'vue/no-v-text-v-html-on-component': 'error',
      'vue/no-async-in-computed-properties': 'error',
      'vue/no-side-effects-in-computed-properties': 'error',
      'vue/no-use-v-if-with-v-for': 'warn',
      'vue/require-v-for-key': 'error',
      'vue/return-in-computed-property': 'error',
      'vue/no-deprecated-data-object-declaration': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
```

---

## 来源
- 官方规则目录：https://eslint.vuejs.org/rules/
- 插件仓库：https://github.com/vuejs/eslint-plugin-vue