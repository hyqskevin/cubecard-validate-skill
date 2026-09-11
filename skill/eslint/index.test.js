/**
 * 卡片 ESLint 测试
 *
 * 路径：skill/eslint/index.test.js
 * 目的：用 ESLint + 自定义 cube-* 规则静态扫描卡片代码，把 lint 结果转成断言。
 *
 * 覆盖：
 *   1. 从 config.yaml 读取的卡片 .vue 文件 <script> 段抽出后 lint
 *   2. 自定义规则：cube/no-unknown-lifecycle / cube/no-magic-event
 *   3. 故意制造的"坏卡"应被命中
 *   4. 内置 ESLint 规则：no-var / prefer-const（全局禁用 var、强制 const）
 *   5. 卡片通用 ESLint 规则：no-template-curly-in-string / no-prototype-builtins
 *      / no-magic-numbers / prefer-promise-shorthand（4 条常用前端规则）
 *
 * 依赖：参考 reference/eslint-plugin-vue-rules.md 与 reference/sonarjs-rules-frontend.md 的
 *       卡片适用子集。
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCardList, getCardsRoot, getCardsSubdir } = require('../config');

const CARDS_DIR = getCardsRoot();
const CARDS_SUBDIR = process.env.CARDS_SUBDIR || getCardsSubdir();
// 卡片 SFC lint 配置路径（多个 describe 套件复用）
const CARD_CONFIG_PATH = path.join(__dirname, 'card.config.mjs');
// skill 工程自身 lint 配置
const SKILL_CONFIG_PATH = path.join(__dirname, 'skill.config.mjs');
let ALL_CARDS = loadCardList();
if (process.env.CARDS_FILTER) {
  const filter = process.env.CARDS_FILTER.split(',').map((s) => s.trim()).filter(Boolean);
  ALL_CARDS = ALL_CARDS.filter((n) => filter.includes(n));
}

/**
 * 从 .vue 抽取 <script> 段（仅支持最外层）
 */
function extractScript(vueContent) {
  const m = vueContent.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) return null;
  return m[1];
}

describe('ESLint 规则：cube/no-unknown-lifecycle', () => {
  let ESLint, cubePlugin;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  test('所有卡片 .vue 的 script 段不报未知生命周期', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        plugins: { cube: cubePlugin },
        rules: {
          'cube/no-unknown-lifecycle': 'error',
        },
      },
    });

    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;

      const tmpFile = path.join(__dirname, `.tmp-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-unknown-lifecycle');
        assert.equal(errors.length, 0, `${cardName} 不应有未知生命周期: ${JSON.stringify(errors)}`);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  test('故意写一个错生命周期（didMounte）的卡应被规则命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        plugins: { cube: cubePlugin },
        rules: {
          'cube/no-unknown-lifecycle': 'error',
        },
      },
    });

    const badScript = `
export default {
    data: { x: 1 },
    didMounte() {  // 故意拼错
        this.x = 2;
    },
    methods: {
        foo() {}
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-lifecycle.js');
    fs.writeFileSync(tmpFile, badScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-unknown-lifecycle');
      assert.ok(errors.length >= 1, '拼错的生命周期应被报错');
      assert.match(errors[0].message, /didMounte/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// =====================================================================
// 4 条新 cube/* 安全/健壮性规则（OWASP A02/A03 + SonarJS 典型反模式）
// =====================================================================
//   - cube/no-hardcoded-secret       SonarJS S2068/S6418/S6437 + OWASP A02
//   - cube/no-setinterval-string     SonarJS S7860 + ESLint no-implied-eval
//   - cube/no-global-this            SonarJS S2990
//   - cube/no-throw-literal          SonarJS S3696

describe('cube/* 新增安全/健壮性规则', () => {
  let ESLint, cubePlugin;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  function buildEslintForCard(rules) {
    // 不走 overrideConfigFile，直接 inline baseConfig（解析 js 反例文件）。
    // ESLint v9 flat config：
    //   1) overrideConfigFile: true 关掉磁盘配置查找（避免 act-cube/src/ 下找不到 flat config 报错）
    //   2) baseConfig 必须自带 plugins 声明才能解析 cube/* 规则
    //   3) sourceType: module 需要 languageOptions.parserOptions 配合（否则默认 parser
    //      按 'script' 解析，'export default' 会报语法错）
    const espree = require('espree');
    return new ESLint({
      overrideConfigFile: true,
      baseConfig: [
        { ignores: ['**/node_modules/**'] },
        {
          files: ['**/*.js'],
          languageOptions: {
            parser: espree,
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
          },
          plugins: { cube: cubePlugin },
          rules: rules || {},
        },
      ],
    });
  }

  // 正向：所有当前评测卡片不应被新规则误命中（卡片清单来自 config.yaml）
  test('所有卡片不应被 cube/no-hardcoded-secret / cube/no-global-this / cube/no-setinterval-string / cube/no-throw-literal 命中', async () => {
    const eslint = buildEslintForCard({
      'cube/no-hardcoded-secret': 'error',
      'cube/no-setinterval-string': 'error',
      'cube/no-global-this': 'error',
      'cube/no-throw-literal': 'error',
    });
    const hits = [];
    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const results = await eslint.lintFiles([vuePath]);
      for (const r of results) {
        for (const m of r.messages.filter((x) => /^cube\/no-(hardcoded-secret|setinterval-string|global-this|throw-literal)$/.test(x.ruleId))) {
          hits.push(`${cardName}: ${m.ruleId}@L${m.line} ${m.message.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    assert.equal(hits.length, 0, `当前卡片被新规则误命中:\n${hits.join('\n')}`);
  });

  // ===== 反例 =====

  test('cube/no-hardcoded-secret：data 里写 token/password/secret 字面量应被命中', async () => {
    const eslint = buildEslintForCard({ 'cube/no-hardcoded-secret': 'error' });
    const bad = `
export default {
    data: {
        appKey: 'sit_app_key_xxxxxxxxxxxx',  // 硬编码 appKey
        token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',  // 硬编码 JWT
        password: 'super_secret_password_123',  // 硬编码密码
    },
    methods: {
        login() { return this.token; }
    }
}`;
    const tmpFile = path.join(__dirname, '.tmp-bad-secret.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const ids = new Set(results.flatMap((r) => r.messages).map((m) => m.ruleId));
      assert.ok(ids.has('cube/no-hardcoded-secret'), '硬编码 secret 应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('cube/no-setinterval-string：setTimeout/setInterval 传字符串应被命中', async () => {
    const eslint = buildEslintForCard({ 'cube/no-setinterval-string': 'error' });
    const bad = `
export default {
    methods: {
        load() {
            setTimeout("alert('x')", 100);          // 字符串 → 隐式 eval
            setInterval(\`doWork()\`, 500);           // 模板字符串 → 隐式 eval
        }
    }
}`;
    const tmpFile = path.join(__dirname, '.tmp-bad-timer.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-setinterval-string');
      assert.ok(hits.length >= 2, 'setTimeout + setInterval 各应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('cube/no-setinterval-string：传函数应不被命中', async () => {
    const eslint = buildEslintForCard({ 'cube/no-setinterval-string': 'error' });
    const good = `
export default {
    methods: {
        load() {
            setTimeout(function() { this.refresh(); }, 100);
            setInterval(() => this.refresh(), 500);
            setTimeout(this.tick, 100);  // 传方法引用不算字符串
        }
    }
}`;
    const tmpFile = path.join(__dirname, '.tmp-good-timer.js');
    fs.writeFileSync(tmpFile, good);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-setinterval-string');
      assert.equal(hits.length, 0, '传 function / arrow 不应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('cube/no-global-this：window / globalThis / self 应被命中', async () => {
    const eslint = buildEslintForCard({ 'cube/no-global-this': 'error' });
    const bad = `
export default {
    methods: {
        load() {
            return window.location.href;       // window
            const x = globalThis.fetch;          // globalThis
            self.postMessage('hi');              // self
        }
    }
}`;
    const tmpFile = path.join(__dirname, '.tmp-bad-global.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-global-this');
      assert.ok(hits.length >= 3, 'window / globalThis / self 都应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('cube/no-throw-literal：throw 字符串 / 数字 / 对象应被命中', async () => {
    const eslint = buildEslintForCard({ 'cube/no-throw-literal': 'error' });
    const bad = `
export default {
    methods: {
        fail() {
            throw 'oops';                         // 字符串
            throw 404;                             // 数字
            throw { code: 500 };                   // 对象
        }
    }
}`;
    const tmpFile = path.join(__dirname, '.tmp-bad-throw.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-throw-literal');
      assert.ok(hits.length >= 3, 'throw 字符串/数字/对象 都应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('cube/no-throw-literal：throw new Error(...) 与 throw err 应不被命中', async () => {
    const eslint = buildEslintForCard({ 'cube/no-throw-literal': 'error' });
    const good = `
export default {
    methods: {
        fail() {
            throw new Error('oops');          // 合规
            throw new TypeError('bad arg');
        },
        rethrow() {
            const err = null;
            if (err) throw err;                  // 合规：变量本身可能为 Error
        }
    }
}`;
    const tmpFile = path.join(__dirname, '.tmp-good-throw.js');
    fs.writeFileSync(tmpFile, good);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-throw-literal');
      assert.equal(hits.length, 0, 'throw new Error / throw err 不应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('ESLint 规则：cube/no-magic-event', () => {
  let ESLint, cubePlugin;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  test('事件回调中使用 eval 应被命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        plugins: { cube: cubePlugin },
        rules: {
          'cube/no-magic-event': 'error',
        },
      },
    });

    const badScript = `
export default {
    methods: {
        onClick() {
            eval('alert(1)');
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-event.js');
    fs.writeFileSync(tmpFile, badScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-magic-event');
      assert.ok(errors.length >= 1, 'eval 在事件回调中应被报错');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('非事件回调中的 eval 应不被命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        plugins: { cube: cubePlugin },
        rules: {
          'cube/no-magic-event': 'error',
        },
      },
    });

    const goodScript = `
export default {
    methods: {
        loadData() {
            // 普通方法（非事件回调）使用 eval 不应被该规则命中
            // （但会被 no-eval 命中）
            return 42;
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-good-event.js');
    fs.writeFileSync(tmpFile, goodScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-magic-event');
      assert.equal(errors.length, 0, 'loadData 不以 on/handle 开头，不应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('所有现有卡片不应被 cube/no-magic-event 命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        plugins: { cube: cubePlugin },
        rules: {
          'cube/no-magic-event': 'error',
        },
      },
    });

    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;

      const tmpFile = path.join(__dirname, `.tmp-evt-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-magic-event');
        assert.equal(errors.length, 0, `${cardName} 不应被 cube/no-magic-event 命中`);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
  });
});

describe('ESLint 基础规则：skill 工程自身', () => {
  let ESLint;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
  });

  test('skill 仓库自身 JS 文件应通过基础规则', async () => {
    const eslint = new ESLint({
      overrideConfigFile: SKILL_CONFIG_PATH,
    });

    // skill 仓库根下的 JS 工具（cube-engine/index.js / cli.js / validate.js / agent/* 等）
    const skillDir = path.join(__dirname, '..');
    const targets = [
      path.join(skillDir, 'cli.js'),
      path.join(skillDir, 'cube-engine', 'index.js'),
    ];
    const results = await eslint.lintFiles(targets);
    const errors = results.flatMap((r) => r.messages).filter((m) => m.severity === 2);
    if (errors.length > 0) {
      console.log('ESLint errors:', JSON.stringify(errors, null, 2));
    }
    assert.equal(errors.length, 0, 'skill 工程自身 JS 应通过基础 lint');
  });
});

// =====================================================================
// 变量声明约束：全局禁止 var、能 const 就用 const
// =====================================================================
describe('ESLint 变量声明约束：禁 var / 优先 const', () => {
  let ESLint;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
  });

  test('所有卡片 script 段不得使用 var，能 const 的必须 const', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-var': 'error', 'prefer-const': 'error' },
      },
    });

    let totalError = 0;
    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;

      const tmpFile = path.join(__dirname, `.tmp-var-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const hits = results.flatMap((r) => r.messages).filter((m) => ['no-var', 'prefer-const'].includes(m.ruleId));
        if (hits.length > 0) {
          totalError += hits.length;
          console.log(`${cardName}: ${hits.map((h) => `${h.ruleId}@${h.line} ${h.message}`).join('; ')}`);
        }
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
    assert.equal(totalError, 0, `存在 var / 可 const 未 const 的错误，共 ${totalError} 处`);
  });

  test('故意写一个 var 的卡应被 no-var 命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-var': 'error' },
      },
    });

    const badScript = `
export default {
    data: { x: 1 },
    methods: {
        load() {
            var broken = 1;   // 故意用 var
            return broken;
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-var.js');
    fs.writeFileSync(tmpFile, badScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'no-var');
      assert.ok(hits.length >= 1, 'var 应被 no-var 命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// =====================================================================
// 复杂卡片 ESLint 测试
// =====================================================================

describe('复杂卡片不应触发规则', () => {
  let ESLint, cubePlugin;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  test('所有 10 张卡片 script 段 cube/no-unknown-lifecycle 不报错', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { cube: cubePlugin },
        rules: { 'cube/no-unknown-lifecycle': 'error' },
      },
    });

    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;

      const tmpFile = path.join(__dirname, `.tmp-life-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-unknown-lifecycle');
        assert.equal(errors.length, 0, `${cardName} 不应有未知生命周期: ${JSON.stringify(errors)}`);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  test('所有 10 张卡片 script 段 cube/no-magic-event 不报错', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { cube: cubePlugin },
        rules: { 'cube/no-magic-event': 'error' },
      },
    });

    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;

      const tmpFile = path.join(__dirname, `.tmp-evt2-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-magic-event');
        assert.equal(errors.length, 0, `${cardName} 不应被 cube/no-magic-event 命中`);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  test('所有 10 张卡片不应使用 eval / new Function', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-eval': 'error', 'no-new-func': 'error' },
      },
    });

    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;

      const tmpFile = path.join(__dirname, `.tmp-eval-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const errors = results.flatMap((r) => r.messages).filter((m) => ['no-eval', 'no-new-func'].includes(m.ruleId));
        assert.equal(errors.length, 0, `${cardName} 不应使用 eval/new Function`);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  test('事件方法命名（on*/handle* 多个 + 含参数）应被规则正确识别而不误报', async () => {
    // 用 inline 反例覆盖"事件方法含参数 / 多个并列事件 / 同时存在非事件方法"三种场景。
    // 这样不依赖任何具体卡片名，规则随配置演化测试也稳定。
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { cube: cubePlugin },
        rules: { 'cube/no-magic-event': 'error' },
      },
    });

    const goodScript = `
export default {
    methods: {
        onAdd(item) { this.list.push(item); },
        onDelete(idx) { this.list.splice(idx, 1); },
        onToggle(idx) { this.list[idx].done = !this.list[idx].done; },
        handleFilter(type) { this.type = type; },
        loadData() { return 42; }  // 非事件方法，混合不被误判
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-event-methods.js');
    fs.writeFileSync(tmpFile, goodScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-magic-event');
      assert.equal(errors.length, 0, '事件方法（含参数）不应误报');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('ESLint 反向测试（坏卡应被命中）', () => {
  let ESLint, cubePlugin;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  test('故意写一个未声明的 computed 方法应被命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { cube: cubePlugin },
        rules: { 'cube/no-unknown-lifecycle': 'error' },
      },
    });

    const badScript = `
export default {
    data: { x: 1 },
    onReady() { // 故意拼错：应是 mounted
        this.x = 2;
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-computed.js');
    fs.writeFileSync(tmpFile, badScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-unknown-lifecycle');
      assert.ok(errors.length >= 1, '拼错的方法应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('故意在 onClick 中使用 Function 构造器应被命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { cube: cubePlugin },
        rules: { 'cube/no-magic-event': 'error' },
      },
    });

    const badScript = `
export default {
    methods: {
        onClick() {
            new Function('return 1')();
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-func.js');
    fs.writeFileSync(tmpFile, badScript);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const errors = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'cube/no-magic-event');
      assert.ok(errors.length >= 1, 'new Function 应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// =====================================================================
// 常用前端 ESLint 规则（卡片通用）
// =====================================================================
// 这些规则在参考 reference/eslint-plugin-vue-rules.md / reference/sonarjs-rules-frontend.md
// 后挑选的"卡片 .vue <script> 段"通用规则，对应 SonarJS：
//   - no-template-curly-in-string    ↔ S3786
//   - no-prototype-builtins            ↔ S2424
//   - no-magic-numbers                 ↔ S109
//   - no-promise-executor-return       ↔ S2303（ESLint 内置）

describe('ESLint 通用规则：卡片常用前端约束', () => {
  let ESLint, cubePlugin;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  // 把 3 条 error 规则 + 已有的 no-var/prefer-const 一起开，作为全局基线。
  // no-magic-numbers / no-promise-executor-return 是 warn，且业务里常出现合理数字
  // （如金额阈值、分页大小、循环上限），故不开作基线；规则本身仍通过反例测试验证有效。
  const baseRules = {
    'no-var': 'error',
    'prefer-const': 'error',
    'no-template-curly-in-string': 'error',
    'no-prototype-builtins': 'error',
  };

  test('所有卡片 script 段应通过通用前端规则基线', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: baseRules,
      },
    });

    const hitsByCard = {};
    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      const script = extractScript(fs.readFileSync(vuePath, 'utf8'));
      if (!script) continue;
      const tmpFile = path.join(__dirname, `.tmp-base-${cardName}.js`);
      fs.writeFileSync(tmpFile, script);
      try {
        const results = await eslint.lintFiles([tmpFile]);
        const hits = results.flatMap((r) => r.messages)
          .filter((m) => Object.keys(baseRules).includes(m.ruleId));
        if (hits.length > 0) {
          hitsByCard[cardName] = hits.map((h) => `${h.ruleId}@${h.line} ${h.message}`);
        }
      } finally {
        fs.unlinkSync(tmpFile);
      }
    }
    if (Object.keys(hitsByCard).length) {
      console.error('卡片通用规则命中：', JSON.stringify(hitsByCard, null, 2));
    }
    assert.equal(Object.keys(hitsByCard).length, 0,
      `${Object.keys(hitsByCard).length} 张卡片违反通用前端规则：${Object.entries(hitsByCard).map(([k, v]) => `${k}: ${v.join('; ')}`).join('\n')}`);
  });

  test('故意在字符串里写 ${name} 应被 no-template-curly-in-string 命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-template-curly-in-string': 'error' },
      },
    });
    const bad = `
export default {
    methods: {
        greet() {
            return 'hello \${name}';   // 故意在普通字符串里写模板字符串占位符
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-curly.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'no-template-curly-in-string');
      assert.ok(hits.length >= 1, '字符串内 ${} 应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('直接调用 obj.hasOwnProperty(...) 应被 no-prototype-builtins 命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-prototype-builtins': 'error' },
      },
    });
    const bad = `
export default {
    methods: {
        has(obj, key) {
            return obj.hasOwnProperty(key);   // 直接调原型方法
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-proto.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'no-prototype-builtins');
      assert.ok(hits.length >= 1, '直接调原型方法应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('不应使用 .then().catch() 嵌套应被 no-promise-executor-return 命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-promise-executor-return': 'warn' },
      },
    });
    const bad = `
export default {
    methods: {
        load() {
            return new Promise((resolve, reject) => {
                return fetch('/api');   // 在 executor 内直接 return，丢失 reject 路径
            });
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-promise.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'no-promise-executor-return');
      assert.ok(hits.length >= 1, 'Promise executor 内直接 return 应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('裸数字 123 应被 no-magic-numbers 命中（0/1/-1 除外）', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-magic-numbers': 'warn' },
      },
    });
    const bad = `
export default {
    methods: {
        calc() {
            return 123 * this.x;  // 故意用裸数字
        }
    }
}
`;
    const tmpFile = path.join(__dirname, '.tmp-bad-magic.js');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'no-magic-numbers');
      assert.ok(hits.length >= 1, '裸数字 123 应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// =====================================================================
// 完整 SFC lint：vue/* + cube/* + JS 规则一起对卡片 .vue 跑
// =====================================================================
// 与前面"通用规则"套件不同：这里直接对 .vue 文件整体跑（template + script + style 三段都覆盖）。
// 用 vue-eslint-parser 解析 SFC，引用 eslint-plugin-vue v10 的 flat/recommended 预设（带 vue/ 前缀）。
describe('完整 SFC lint（vue/* + cube/* + JS）', () => {
  let ESLint, cubePlugin, vuePlugin, vueParser;
  before(async () => {
    const eslintModule = await import('eslint');
    ESLint = eslintModule.ESLint;
    cubePlugin = require('./plugin.js');
  });

  // 卡片 SFC 的 ESLint 配置独立抽到 eslint.card.config.mjs
  // （含 vue/* flat/recommended 预设 + cube/* + ACT 特殊豁免 + 内置 JS 规则）

  function buildEslint(extraRules = {}) {
    const eslint = new ESLint({
      overrideConfigFile: CARD_CONFIG_PATH,
    });
    if (extraRules && Object.keys(extraRules).length > 0) {
      // 反例测试需要临时附加 / 覆盖规则：在外部追加 baseConfig
      return new ESLint({
        overrideConfigFile: CARD_CONFIG_PATH,
        baseConfig: [{ rules: extraRules }],
      });
    }
    return eslint;
  }

  test('所有卡片 .vue 完整 SFC 应通过 vue/* + cube/* + JS 校验基线', async () => {
    const eslint = buildEslint();
    const hitsByCard = {};
    for (const cardName of ALL_CARDS) {
      const vuePath = path.join(CARDS_DIR, cardName, CARDS_SUBDIR, cardName, 'main.vue');
      if (!fs.existsSync(vuePath)) continue;
      try {
        const results = await eslint.lintFiles([vuePath]);
        const messages = results.flatMap((r) => r.messages);
        // 仅看 error 严重度；preset 默认推荐的 warning 不强制
        const realHits = messages.filter((m) => m.severity === 2);
        if (realHits.length > 0) {
          hitsByCard[cardName] = realHits.map(
            (h) => `${h.ruleId}@L${h.line} ${h.message.replace(/\s+/g, ' ').slice(0, 80)}`
          );
        }
      } catch (e) {
        hitsByCard[cardName] = ['LINT_ERROR: ' + e.message];
      }
    }
    if (Object.keys(hitsByCard).length) {
      console.error('SFC 校验命中：', JSON.stringify(hitsByCard, null, 2));
    }
    assert.equal(Object.keys(hitsByCard).length, 0,
      `${Object.keys(hitsByCard).length} 张卡片 SFC 校验不通过`);
  });

  test('故意在卡片里写 v-html 应被 vue/no-v-html 命中', async () => {
    const eslint = buildEslint();
    const bad = `<template>
    <text v-html="userInput"></text>
</template>
<script>
    export default { data: () => ({ userInput: '<img onerror=alert(1)>' }) };
</script>`;
    const tmpFile = path.join(__dirname, '.tmp-sfc-bad-vhtml.vue');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'vue/no-v-html');
      assert.ok(hits.length >= 1, 'v-html 应被 vue/no-v-html 命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('v-for 缺 :key 应被 vue/valid-v-for 命中', async () => {
    const eslint = buildEslint();
    const bad = `<template>
    <text v-for="i in items" :value="i"></text>
</template>
<script>
    export default { data: () => ({ items: [1, 2, 3] }) };
</script>`;
    const tmpFile = path.join(__dirname, '.tmp-sfc-bad-key.vue');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter(
        (m) => m.ruleId === 'vue/valid-v-for' || m.ruleId === 'vue/require-v-for-key'
      );
      assert.ok(hits.length >= 1, 'v-for 缺 :key 应被命中（valid-v-for 或 require-v-for-key）');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('v-if 与 v-for 同元素应被 vue/no-use-v-if-with-v-for 命中', async () => {
    const eslint = buildEslint();
    const bad = `<template>
    <text v-if="cond" v-for="i in items" :key="i" :value="i"></text>
</template>
<script>
    export default { data: () => ({ cond: true, items: [1,2,3] }) };
</script>`;
    const tmpFile = path.join(__dirname, '.tmp-sfc-bad-vif.vue');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'vue/no-use-v-if-with-v-for');
      assert.ok(hits.length >= 1, 'v-if + v-for 同元素应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('模板里写 this.x 应被 vue/this-in-template 命中', async () => {
    const eslint = buildEslint();
    const bad = `<template>
    <text :value="this.title"></text>
</template>
<script>
    export default { data: () => ({ title: 'x' }) };
</script>`;
    const tmpFile = path.join(__dirname, '.tmp-sfc-bad-this.vue');
    fs.writeFileSync(tmpFile, bad);
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'vue/this-in-template');
      assert.ok(hits.length >= 1, '模板 this.x 应被命中');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
