// 卡片 SFC（.vue）ESLint 配置
//
// 路径：skill/eslint/card.config.mjs
// 职责：
//   - 校验 ACT Cube 卡片源码（src/<card>/cards/<card>/main.vue）
//   - 覆盖 template + script + style 三段（vue-eslint-parser 解析完整 SFC）
//
// 与 eslint/skill.config.mjs 的关系：
//   - skill.config.mjs：lint skill 仓库自身 JS（cli.js / validate/index.js 等）
//   - card.config.mjs（本文）：lint 卡片 .vue
//   两者职责互不重叠，互不引用。
//
// 使用方式：
//   1. 测试入口（默认）：node --test eslint/index.test.js
//      → eslint/index.test.js 通过 overrideConfigFile 引用本文
//   2. 外部调用：
//        const { ESLint } = require('eslint');
//        const eslint = new ESLint({ overrideConfigFile: 'eslint/card.config.mjs' });
//        await eslint.lintFiles(['cards/**/*.vue']);
//   3. CI（CLI 调用）：
//        node cli.js --lint
//        （cli.js 通过 ESLint.lintFiles 引用本文）
//
// 规则来源：
//   - vue/*   : eslint-plugin-vue v10 的 flat/recommended 预设（70+ 防错 / 风格规则）
//   - cube/*  : ./plugin.js（自定义卡片规则）
//   - 内置 JS : ESLint v9 自带规则（no-eval / no-var / prefer-const 等）

import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import cubePlugin from './plugin.js';

export default [
  // 忽略依赖与产物
  { ignores: ['**/node_modules/**', '**/dist/**'] },

  // 引入 eslint-plugin-vue v10 的 flat/recommended 预设（注册 vue/* 规则 + 默认 plugins）
  ...vuePlugin.configs['flat/recommended'],

  // 在预设基础上追加：
  //   - parser：vue-eslint-parser（覆盖 espree）
  //   - cube 插件
  //   - ACT DSL 特殊豁免（见下）
  //   - cube/* + 内置 JS 规则
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { cube: cubePlugin },
    rules: {
      // ===== ACT DSL 特殊豁免（v10 preset 默认启用但对卡片不适用）=====
      // ACT 是 Vue 2 子集，data 仍允许声明为对象
      'vue/no-deprecated-data-object-declaration': 'off',
      'vue/no-shared-component-data': 'off',

      // 关闭 vue/* 布局/格式规则（ACT DSL 有自己的缩进/属性风格约定，
      // 强制 vue 推荐风格会让所有卡片 warning 刷屏，掩盖真问题）。
      // 保留所有 vue/* 防错/语义类规则（no-v-html / valid-v-for / this-in-template 等）。
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-quotes': 'off',
      'vue/mustache-interpolation-spacing': 'off',
      'vue/no-multi-spaces': 'off',
      'vue/no-spaces-around-equal-signs-in-attribute': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/v-bind-style': 'off',
      'vue/v-on-style': 'off',
      'vue/v-slot-style': 'off',
      'vue/no-template-shadow': 'off',  // 与 ACT 模板简化结构冲突
      'vue/return-in-computed-property': 'off',  // ACT DSL getter 允许不显式 return
      'vue/no-unused-components': 'off',  // 卡片无子组件
      'vue/multi-word-component-names': 'off',  // ACT 卡片文件名固定 main.vue，无法多词
      'vue/no-mutating-props': 'off',     // ACT 无 props
      'vue/require-prop-types': 'off',    // ACT 无 props
      'vue/require-default-prop': 'off',  // ACT 无 props
      'vue/return-in-emits-validator': 'off',
      'vue/no-async-in-computed-properties': 'off',  // 引擎层 v14 业务完备覆盖
      'vue/no-side-effects-in-computed-properties': 'off',  // 引擎层
      'vue/this-in-template': 'warn',       // 模板写 this 不强制 error（cube/* 已覆盖）

      // ===== cube/* 自定义规则（卡片结构专属）=====
      'cube/no-unknown-lifecycle': 'error',  // V8 钩子白名单
      'cube/no-magic-event': 'error',        // 事件回调禁 eval/Function
      'cube/no-shadow-data': 'warn',         // method 内 var 遮蔽 data
      'cube/no-magic-color-hex': 'warn',     // 硬编码颜色（建议走 design token）
      'cube/vfor-key-required': 'error',     // v-for 必须搭配 :key
      'cube/required-props': 'error',        // .vue 必须有 template/script/style 三段
      // 安全/健壮性规则（OWASP A02/A03 + SonarJS 典型反模式）
      'cube/no-hardcoded-secret': 'error',   // S2068/S6418/S6437 - 硬编码 token/password
      'cube/no-setinterval-string': 'error', // S7860 + no-implied-eval - setTimeout 字符串参数
      'cube/no-global-this': 'error',        // S2990 - 禁 window/globalThis/self（绕过宿主沙箱）
      'cube/no-throw-literal': 'error',      // S3696 - throw 应为 Error 实例

      // ===== vue/* 防错规则（ACT DSL 适用）=====
      'vue/no-v-html': 'error',              // ACT DSL 不支持 v-html，命中即 error

      // ===== ESLint 内置 JS 规则（与本 skill 工程保持一致）=====
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-template-curly-in-string': 'error',  // 防普通字符串里写 ${name}
      'no-prototype-builtins': 'error',        // 防直接 obj.hasOwnProperty(...)
    },
  },
];
