/**
 * agent 生成 main.test.js。
 *
 * 目标：
 *   - 让生成结果可运行、可断言、可回归
 *   - 不再让 LLM 直接生成完整 JS 文件
 *   - 改成 LLM 只输出"测试用例 JSON"，由本模块稳定渲染成 node:test 文件
 *   - 增加语义校验，拦截明显不合理的用例
 *
 * 流程：
 *   1. 读取卡片源码 / 产物 / case.md
 *   2. 调 LLM 生成测试用例 JSON
 *   3. 结构归一化 + 语义校验
 *   4. 用固定模板渲染 main.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { complete } = require('./llm-client');
const { getCardsRoot, getCardsSubdir, readRootYaml } = require('../config');

const MAX_FILE_CHARS = 12000;
const ALLOWED_KINDS = new Set(['method', 'event', 'lifecycle', 'render']);
const ALLOWED_EXPR_PREFIXES = ['engine.state.', 'engine.evalExpr('];

function safeRead(p, cap = MAX_FILE_CHARS) {
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  return text.length > cap ? text.slice(0, cap) + `\n\n/* (truncated, original ${text.length} chars) */` : text;
}

function extractJson(content) {
  const fence = content.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const raw = (fence ? fence[1] : content).trim();
  const start = raw.indexOf('[');
  if (start === -1) throw new Error('LLM 输出里未找到 JSON 数组');
  for (let end = raw.lastIndexOf(']'); end > start; end = raw.lastIndexOf(']', end - 1)) {
    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  throw new Error('LLM 输出里未找到可解析的 JSON 数组');
}

function buildCasegenPrompt(card, files, minCases) {
  return [
    `# 任务`,
    `为 ACT Cube 卡片「${card}」生成测试用例 JSON。`,
    ``,
    `# 输入：测试案例（如有，必须参考）`,
    files.caseMd || `(未提供 case.md，请基于 main.vue 自行设计至少 ${minCases} 条用例)`,
    ``,
    `# 输入：卡片源码 / 产物`,
    ``,
    `## main.vue`,
    '```vue',
    files.mainVue || '',
    '```',
    ``,
    `## manifest.json`,
    '```json',
    files.manifest || '',
    '```',
    ``,
    `## dist/main.js`,
    '```js',
    files.distMain || '',
    '```',
    ``,
    `## dist/main.json`,
    '```json',
    files.distStruct || '',
    '```',
    ``,
    `# 输出要求`,
    `只输出一个 JSON 数组，不要输出任何解释文字。`,
    `数组元素结构必须是：`,
    `{"id":"CASE-001","title":"...","kind":"method","setup":{"count":10},"actions":[{"type":"method","target":"increment","args":[],"repeat":3}],"assertions":[{"expr":"engine.state.count","expected":13}]}`,
    ``,
    `字段说明：`,
    `- id: 用例 ID`,
    `- title: 用例标题`,
    `- kind: method | render | lifecycle | event`,
    `- setup: 先写入 engine.state 的键值对，可空`,
    `- actions: 执行动作数组，至少 1 个`,
    `- actions[].type: method | event | lifecycle | noop`,
    `- actions[].target: 方法名 / 事件名 / 生命周期名`,
    `- actions[].args: 参数数组，可空`,
    `- actions[].repeat: 重复次数，默认 1`,
    `- assertions: 至少 1 条断言`,
    `- assertions[].expr: 只能使用 engine.state.xxx 或 engine.evalExpr('...')`,
    `- assertions[].expected: 期望值`,
    ``,
    `约束：`,
    `- 至少输出 ${minCases} 条`,
    `- kind 为 method 时，target 必须来自 main.vue methods 里的真实方法名`,
    `- kind 为 lifecycle 时，target 必须来自真实生命周期名`,
    `- setup 只能写 main.vue data 里真实存在的字段`,
    `- 不要发明不存在的字段、方法、事件或 API`,
    `- 连续多次调用必须用 actions[].repeat 表示`,
    `- 所有断言必须可通过当前引擎真实求值`,
  ].join('\n');
}

function collectSymbols(files) {
  const mainVue = files.mainVue || '';
  const dataKeys = new Set();
  const methodKeys = new Set();
  const lifecycleKeys = new Set(['beforeCreate', 'created', 'beforeMount', 'mounted', 'beforeUpdate', 'updated', 'didAppear', 'didDisappear', 'didMount']);

  const dataMatch = mainVue.match(/data\s*:\s*\{([\s\S]*?)\n\s*\}/);
  if (dataMatch) {
    for (const m of dataMatch[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) {
      dataKeys.add(m[1]);
    }
  }

  const methodsMatch = mainVue.match(/methods\s*:\s*\{([\s\S]*?)\n\s*\}/);
  if (methodsMatch) {
    for (const m of methodsMatch[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
      methodKeys.add(m[1]);
    }
  }

  const exportMatch = mainVue.match(/export\s+default\s*\{([\s\S]*)\}/);
  if (exportMatch) {
    for (const m of exportMatch[1].matchAll(/^\s*(beforeCreate|created|beforeMount|mounted|beforeUpdate|updated|didAppear|didDisappear|didMount)\s*\(/gm)) {
      lifecycleKeys.add(m[1]);
    }
  }

  return { dataKeys, methodKeys, lifecycleKeys };
}

function normalizeCases(cases) {
  if (!Array.isArray(cases)) throw new Error('用例 JSON 必须是数组');
  return cases.map((c, idx) => {
    if (!c || typeof c !== 'object') throw new Error(`第 ${idx + 1} 条用例不是对象`);
    const rawAssertions = Array.isArray(c.assertions) && c.assertions.length
      ? c.assertions
      : (Array.isArray(c.expects) && c.expects.length
          ? c.expects
          : (c.expr && 'expected' in c
              ? [{ expr: c.expr, expected: c.expected }]
              : null));
    if (!rawAssertions) {
      throw new Error(`第 ${idx + 1} 条用例缺 assertions`);
    }

    const setup = c.setup && typeof c.setup === 'object' ? c.setup : {};
    const rawActions = Array.isArray(c.actions) && c.actions.length
      ? c.actions
      : (c.target
          ? [{ type: c.kind === 'render' ? 'noop' : c.kind, target: c.target, args: Array.isArray(c.args) ? c.args : [], repeat: 1 }]
          : [{ type: 'noop', target: '', args: [], repeat: 1 }]);

    const actions = rawActions.map((a, aIdx) => {
      if (!a || typeof a !== 'object') throw new Error(`第 ${idx + 1} 条用例第 ${aIdx + 1} 个 action 不是对象`);
      const type = a.type || (c.kind === 'render' ? 'noop' : c.kind);
      if (!['method', 'event', 'lifecycle', 'noop'].includes(type)) {
        throw new Error(`第 ${idx + 1} 条用例第 ${aIdx + 1} 个 action type 非法: ${type}`);
      }
      const repeat = Number.isInteger(a.repeat) && a.repeat > 0 ? a.repeat : 1;
      return {
        type,
        target: typeof a.target === 'string' ? a.target : '',
        args: Array.isArray(a.args) ? a.args : [],
        repeat,
      };
    });

    const kind = ALLOWED_KINDS.has(c.kind)
      ? c.kind
      : (actions.some((a) => a.type === 'method')
          ? 'method'
          : actions.some((a) => a.type === 'lifecycle')
            ? 'lifecycle'
            : actions.some((a) => a.type === 'event')
              ? 'event'
              : 'render');

    const assertions = rawAssertions.map((a) => {
      if (!a || typeof a.expr !== 'string' || !('expected' in a)) {
        throw new Error(`第 ${idx + 1} 条用例存在非法断言`);
      }
      if (!ALLOWED_EXPR_PREFIXES.some((prefix) => a.expr.startsWith(prefix))) {
        throw new Error(`第 ${idx + 1} 条用例断言表达式非法: ${a.expr}`);
      }
      return { expr: a.expr, expected: a.expected };
    });

    return {
      id: c.id || `CASE-${String(idx + 1).padStart(3, '0')}`,
      title: c.title || c.id || `用例 ${idx + 1}`,
      kind,
      setup,
      actions,
      assertions,
    };
  });
}

function validateCaseSemantics(caseItem, symbols, idx) {
  const problems = [];
  for (const key of Object.keys(caseItem.setup || {})) {
    if (!symbols.dataKeys.has(key)) {
      problems.push(`setup 字段 ${key} 不存在于 data`);
    }
  }

  for (const [aIdx, action] of caseItem.actions.entries()) {
    if (action.type === 'method' && !symbols.methodKeys.has(action.target)) {
      problems.push(`action${aIdx + 1} 方法 ${action.target} 不存在于 methods`);
    }
    if (action.type === 'lifecycle' && !symbols.lifecycleKeys.has(action.target)) {
      problems.push(`action${aIdx + 1} 生命周期 ${action.target} 不存在`);
    }
  }

  for (const assertion of caseItem.assertions) {
    const stateMatch = assertion.expr.match(/^engine\.state\.([A-Za-z_$][\w$]*)/);
    if (stateMatch && !symbols.dataKeys.has(stateMatch[1])) {
      problems.push(`断言字段 ${stateMatch[1]} 不存在于 data`);
    }
  }

  if (caseItem.kind === 'method') {
    const hasMethodAction = caseItem.actions.some((a) => a.type === 'method');
    if (!hasMethodAction) problems.push('kind=method 但没有任何 method action');
  }

  if (caseItem.kind === 'lifecycle') {
    const hasLifecycleAction = caseItem.actions.some((a) => a.type === 'lifecycle');
    if (!hasLifecycleAction) problems.push('kind=lifecycle 但没有任何 lifecycle action');
  }

  return problems.length ? [`第 ${idx + 1} 条用例（${caseItem.title}）`, ...problems] : null;
}

function filterSemanticallyValidCases(cases, symbols) {
  const valid = [];
  const invalid = [];
  cases.forEach((c, idx) => {
    const problem = validateCaseSemantics(c, symbols, idx);
    if (problem) invalid.push(problem);
    else valid.push(c);
  });
  return { valid, invalid };
}

function renderActionLine(action) {
  if (action.type === 'method') {
    return `      for (let i = 0; i < ${action.repeat}; i++) engine.state[${JSON.stringify(action.target)}](...${JSON.stringify(action.args)});`;
  }
  if (action.type === 'lifecycle') {
    return `      for (let i = 0; i < ${action.repeat}; i++) { if (typeof engine.logic?.[${JSON.stringify(action.target)}] === 'function') engine.logic[${JSON.stringify(action.target)}](); }`;
  }
  if (action.type === 'event') {
    return `      for (let i = 0; i < ${action.repeat}; i++) engine.trigger(engine.vdom.nid, ${JSON.stringify(action.target)}, {});`;
  }
  return `      void ${JSON.stringify(action.target)};`;
}

function renderTestFile(card, cases) {
  const caseBlocks = cases.map((c) => {
    const setupLines = Object.entries(c.setup || {}).map(([k, v]) => `      engine.state[${JSON.stringify(k)}] = ${JSON.stringify(v)};`);
    const actionLines = c.actions.map(renderActionLine);
    const assertionLines = c.assertions.map((a) => `      assert.deepEqual(${a.expr}, ${JSON.stringify(a.expected)});`);

    return `    test(${JSON.stringify(`${c.id} ${c.title}`)}, () => {\n      const engine = createEngine(loadCard());\n${setupLines.join('\n')}\n${actionLines.join('\n')}\n${assertionLines.join('\n')}\n    });`;
  }).join('\n\n');

  return `const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createEngine } = require('../../cube-engine');
const { getCardsRoot, getCardsSubdir } = require('../../config');

const CARDS_ROOT = process.env.CARDS_ROOT || getCardsRoot();
const SUB = process.env.CARDS_SUBDIR || getCardsSubdir();
const DIST = path.join(CARDS_ROOT, 'dist', ${JSON.stringify(card)});

function loadCard() {
  return {
    json: JSON.parse(fs.readFileSync(path.join(DIST, 'main.json'), 'utf8')),
    js: fs.readFileSync(path.join(DIST, 'main.js'), 'utf8'),
    mock: null,
  };
}

describe(${JSON.stringify(`${card} - agent generated`)}, () => {
${caseBlocks}
});
`;
}

function syntaxCheck(code) {
  const r = spawnSync(process.execPath, ['--check', '-'], {
    input: code,
    encoding: 'utf8',
    shell: false,
  });
  if (r.status !== 0) {
    return { ok: false, stderr: r.stderr };
  }
  return { ok: true };
}

function renderSingleCaseTestFile(card, caseItem) {
  const setupLines = Object.entries(caseItem.setup || {}).map(([k, v]) => `engine.state[${JSON.stringify(k)}] = ${JSON.stringify(v)};`);
  const actionLines = caseItem.actions.map(renderActionLine);
  const assertionLines = caseItem.assertions.map((a) => `assert.deepEqual(${a.expr}, ${JSON.stringify(a.expected)});`);
  return `const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createEngine } = require(${JSON.stringify(path.resolve(__dirname, '..', 'cube-engine'))});
const { getCardsRoot, getCardsSubdir } = require(${JSON.stringify(path.resolve(__dirname, '..', 'config'))});
const CARDS_ROOT = process.env.CARDS_ROOT || getCardsRoot();
const SUB = process.env.CARDS_SUBDIR || getCardsSubdir();
const DIST = path.join(CARDS_ROOT, 'dist', ${JSON.stringify(card)});
function loadCard() {
  return {
    json: JSON.parse(fs.readFileSync(path.join(DIST, 'main.json'), 'utf8')),
    js: fs.readFileSync(path.join(DIST, 'main.js'), 'utf8'),
    mock: null,
  };
}
const engine = createEngine(loadCard());
${setupLines.join('\n')}
${actionLines.join('\n')}
${assertionLines.join('\n')}
`;
}

function smokeValidateCases(card, cases) {
  const passed = [];
  const failed = [];
  for (const [idx, c] of cases.entries()) {
    const code = renderSingleCaseTestFile(card, c);
    const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', shell: false });
    if (r.status === 0) {
      passed.push(c);
    } else {
      failed.push([`第 ${idx + 1} 条用例（${c.title}）`, (r.stderr || r.stdout || '执行失败').split('\n').slice(0, 6).join('\n')]);
    }
  }
  return { passed, failed };
}

async function generate(card, opts = {}) {
  const CARDS_ROOT = getCardsRoot();
  const SUB = getCardsSubdir();
  const srcDir = path.join(CARDS_ROOT, card, SUB, card);
  const distDir = path.join(CARDS_ROOT, 'dist', card);
  const testsRoot = path.resolve(__dirname, '..', '..', 'test');
  const outDir = opts.outDir || path.join(testsRoot, card);
  const yaml = readRootYaml();
  const minCases = Number.isInteger(opts.minCases) && opts.minCases > 0
    ? opts.minCases
    : (Number.isInteger(yaml.agent?.minCases) && yaml.agent.minCases > 0 ? yaml.agent.minCases : 8);

  const files = {
    caseMd: opts.caseMd != null ? opts.caseMd : safeRead(path.join(outDir, 'case.md')),
    mainVue: safeRead(path.join(srcDir, 'main.vue')),
    manifest: safeRead(path.join(srcDir, 'manifest.json')),
    distMain: safeRead(path.join(distDir, 'main.js')),
    distStruct: safeRead(path.join(distDir, 'main.json'), 4000),
  };

  const outPath = path.join(outDir, 'main.test.js');
  if (fs.existsSync(outPath) && !opts.force) {
    return { ok: false, reason: `已存在 ${outPath}，跳过（--force 覆盖）`, outPath };
  }

  let content = null;
  let parsed = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      content = await complete(buildCasegenPrompt(card, files, minCases));
      parsed = extractJson(content);
      break;
    } catch (e) {
      lastErr = e;
      parsed = null;
    }
  }
  if (!parsed) {
    return { ok: false, reason: `LLM 输出解析失败: ${lastErr ? lastErr.message : '未知错误'}`, outPath, raw: content };
  }

  const cases = normalizeCases(parsed);
  const symbols = collectSymbols(files);
  const { valid, invalid } = filterSemanticallyValidCases(cases, symbols);
  const smoke = smokeValidateCases(card, valid);
  const finalCases = smoke.passed;

  if (finalCases.length === 0) {
    const semanticReason = invalid.map((lines) => lines.join('\n  - ')).join('\n');
    const smokeReason = smoke.failed.map((lines) => lines.join('\n  ')).join('\n');
    return {
      ok: false,
      reason: `生成用例未通过语义/冒烟校验\n\n语义校验失败：\n${semanticReason}\n\n冒烟失败：\n${smokeReason}`,
      outPath,
      raw: content,
    };
  }

  const code = renderTestFile(card, finalCases);
  const check = syntaxCheck(code);
  if (!check.ok) {
    return { ok: false, reason: `语法检查失败: ${check.stderr}`, outPath, raw: content };
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, code, 'utf8');
  return {
    ok: true,
    outPath,
    bytes: Buffer.byteLength(code),
    caseCount: finalCases.length,
    semanticInvalidCount: invalid.length,
    smokeFailedCount: smoke.failed.length,
    invalid,
    smokeFailed: smoke.failed,
  };
}

module.exports = {
  generate,
  buildCasegenPrompt,
  extractJson,
  normalizeCases,
  collectSymbols,
  validateCaseSemantics,
  filterSemanticallyValidCases,
  renderActionLine,
  renderSingleCaseTestFile,
  smokeValidateCases,
  renderTestFile,
  syntaxCheck,
};
