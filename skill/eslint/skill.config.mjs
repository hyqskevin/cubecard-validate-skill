// skill 工程自身 JS 代码的 ESLint 配置
//
// 路径：skill/eslint/skill.config.mjs（TODO #30：所有 eslint 相关文件归到 eslint/）
// 职责：
//   - 仅作用于本 skill 仓库（act-cube/skill/）下的 *.js
//   - 校验 skill 自己写的工具代码（cli.js / validate/index.js / cube-engine/index.js / eslint/plugin.js 等）
//
// 注意：
//   1. 卡片 .vue 的 lint 不在此配置中。卡片 lint 的入口在 eslint/index.test.js
//      （"完整 SFC lint"套件），用 vue-eslint-parser + eslint-plugin-vue 临时构造
//      ESLint 实例跑，不走本 config。
//   2. 历史上的 cube/* 规则（cube/no-magic-event / cube/no-shadow-data）
//      仅识别 `export default { methods: { onClick() {...} } }` 这种卡片结构，
//      在本 skill 的 JS 文件里永远不会触发，已从本 config 移除。
//
// 真正给卡片用的规则在 eslint/index.test.js。

export default [
  // 忽略 dist / 产物 / 第三方依赖
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },

  // 对 skill 工程下所有 .js 应用基础规则
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        // 浏览器 / JS 标准
        console: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Promise: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
];
