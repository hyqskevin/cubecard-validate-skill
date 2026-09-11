/**
 * agent 生成测试案例 case.md。
 *
 * 场景：
 *   - 无 Excel / 无 CSV 输入时，通过阅读卡片 main.vue 生成结构化测试案例
 *   - 生成的 case.md 后续交给 testgen 生成 main.test.js
 *
 * 设计：
 *   - 只依赖 LLM 与卡片源码
 *   - 输出统一走 ../test/<card>/case.md
 */

const fs = require('node:fs');
const path = require('node:path');
const { complete } = require('./llm-client');
const { getCardsRoot, getCardsSubdir } = require('../config');

const MAX_FILE_CHARS = 12000;

function safeRead(p, cap = MAX_FILE_CHARS) {
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  return text.length > cap ? text.slice(0, cap) + `\n\n/* (truncated, original ${text.length} chars) */` : text;
}

function extractMarkdown(content) {
  const fence = content.match(/```(?:md|markdown)?\s*\n([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return content.trim();
}

function buildCasePrompt(card, files, minCases) {
  return [
    `# 任务`,
    `为 ACT Cube 卡片「${card}」生成结构化测试案例 markdown（case.md）。`,
    ``,
    `# 输入：卡片源码`,
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
    `# 输出要求`,
    `1. 只输出 markdown，不要解释文字`,
    `2. 用 markdown code fence 包裹`,
    `3. 至少生成 ${minCases} 条测试用例`,
    `4. 每条用例必须包含以下字段：`,
    `   - case_id`,
    `   - module`,
    `   - title`,
    `   - pre_state`,
    `   - steps`,
    `   - expected`,
    `   - priority`,
    `   - tags`,
    `5. 用例要基于 main.vue 中的真实 data / methods / 生命周期 / 事件 / 渲染逻辑设计，不要空泛`,
    `6. 输出结构参考：`,
    ``,
    '```md',
    `# ${card} 测试案例`,
    ``,
    `> 自动生成自卡片源码。`,
    ``,
    `## 总览`,
    ``,
    `- 用例总数：N`,
    ``,
    `## 用例详情`,
    ``,
    `### 1. [CASE-001] 标题`,
    `- **优先级**: P0`,
    `- **模块**: methods.xxx`,
    `- **标签**: smoke`,
    `- **前置状态**: ...`,
    `- **步骤**:`,
    ``,
    `  1. ...`,
    `  2. ...`,
    ``,
    `- **预期**: ...`,
    '```',
  ].join('\n');
}

/**
 * 生成单卡 case.md。
 * @param {string} card
 * @param {{minCases?:number, outDir?:string, force?:boolean}} [opts]
 */
async function generateCaseMd(card, opts = {}) {
  const minCases = Number.isInteger(opts.minCases) && opts.minCases > 0 ? opts.minCases : 8;
  const CARDS_ROOT = getCardsRoot();
  const SUB = getCardsSubdir();
  const srcDir = path.join(CARDS_ROOT, card, SUB, card);
  const testsRoot = path.resolve(__dirname, '..', '..', 'test');
  const outDir = opts.outDir || path.join(testsRoot, card);
  const outPath = path.join(outDir, 'case.md');

  const files = {
    mainVue: safeRead(path.join(srcDir, 'main.vue')),
    manifest: safeRead(path.join(srcDir, 'manifest.json')),
  };

  if (fs.existsSync(outPath) && !opts.force) {
    return { ok: false, reason: `已存在 ${outPath}，跳过（--force 覆盖）`, outPath };
  }

  const content = await complete(buildCasePrompt(card, files, minCases));
  const md = extractMarkdown(content);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, md, 'utf8');
  return { ok: true, outPath, bytes: Buffer.byteLength(md) };
}

module.exports = { generateCaseMd, buildCasePrompt, extractMarkdown };
