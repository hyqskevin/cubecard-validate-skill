/**
 * ACT Cube DSL 静态校验器（v5 - rule registry + severity）
 *
 * 路径：skill/validate/index.js
 * 职责：
 *   - 对单张卡片执行 V1-V23 静态规则检查（结构 / 逻辑 / 样式 / 安全 /
 *     业务 / 生态 / 数据 7 个维度）
 *   - 按规则 severity 派发到 errors / warnings / info 三个桶
 *   - 提供 validateAll / summarize / validateCard 三入口供 cli.js 调用
 *
 * 演进：
 *   v1: 启发式正则 + vm 沙箱解析 script（脆弱）
 *   v2: 修 quote-aware / 箭头函数 / 解析截断（仍然启发式）
 *   v3: 加入 V1-V10 维度划分
 *   v4: 用 vue-eslint-parser 7.x + espree 9 + ajv 8 重写
 *   v5: 规则从 validate/rules.config.json 注册表加载；severity 在 JSON
 *       里声明（error/warning/info）；项目可扩展自己的 contract
 *       规则包（配置 + JS 实现）
 *
 * 技术栈（对齐 ACT 4.0 cube-lint / cube-program）：
 *   - manifest   → ajv 8 + JSON Schema
 *   - 模板       → vue-eslint-parser 7.x 的 VElement / VAttribute AST
 *   - script     → espree 9（vue-eslint-parser 内部用）的 JS ESTree AST
 */

const fs = require('node:fs');
const path = require('node:path');
// 路径已迁移到 skill/validate/ 子目录：
//   rules/    → ./rules （V1-V23 规则实现在 validate/rules/ 下）
//   config/   → ../config
const { buildContext } = require('./rules/_shared/context');
const { loadEnabledRules } = require('../config/rules-loader');

/**
 * 校验一张卡片。
 * 接受 options:
 *   - ruleSet: 自定义规则数组（默认从 validate/rules.config.json 读）
 *
 * @returns {{card:string, errors:string[], warnings:string[], info:string[]}}
 */
function validateCard(cardPath, options = {}) {
  const cardName = path.basename(cardPath);
  const result = { card: cardName, errors: [], warnings: [], info: [] };

  if (!fs.existsSync(cardPath)) {
    result.errors.push('card 目录不存在');
    return result;
  }

  const ctx = buildContext(cardPath);
  if (ctx.parseError) {
    // 解析失败：V0 级别的硬错误，后续规则没意义
    result.errors.push(ctx.parseError);
    return result;
  }

  const rules = options.ruleSet || loadEnabledRules();
  for (const rule of rules) {
    try {
      // 规则包约定 check(ctx, result, cardName)；options 注入到 ctx._ruleOptions[rule.id]
      ctx._ruleOptions = Object.assign(ctx._ruleOptions || {}, rule.options || {});
      ctx._ruleOptions._ruleId = rule.id;
      rule.mod.check(ctx, result, cardName);
    } catch (e) {
      // 规则包异常：按其 severity 派发
      const msg = `${rule.id}: 规则自身异常: ${e.message}`;
      if (rule.severity === 'error') result.errors.push(msg);
      else if (rule.severity === 'warning') result.warnings.push(msg);
      else result.info.push(msg);
    }
  }

  return result;
}

/**
 * 校验 cards 目录下所有卡片。
 * 接受 options:
 *   - sourceSubdir  默认 'cards'；生产可传 'src' 兼容
 *   - cards         数组指定要校验的卡片名（默认全部；不传则从 config.yaml 拉）
 *   - ruleSet      自定义规则数组（默认从 validate/rules.config.json 读）
 */
function validateAll(cardsDir, options = {}) {
  const { sourceSubdir = 'cards', cards: cardFilter, ruleSet } = options;
  const entries = fs.readdirSync(cardsDir).filter((name) => {
    const full = path.join(cardsDir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { return false; }
    if (!stat.isDirectory()) return false;
    const vuePath = path.join(full, sourceSubdir, name, 'main.vue');
    if (!fs.existsSync(vuePath)) return false;
    if (cardFilter && !cardFilter.includes(name)) return false;
    return true;
  });
  const validateOptions = ruleSet ? { ruleSet } : {};
  return entries.map((name) =>
    validateCard(path.join(cardsDir, name, sourceSubdir, name), validateOptions)
  );
}

/**
 * 汇总：passCount / failCount / warnCount
 * @param {Array} allResults validateAll 返回值
 * @param {object} options.ruleSet 自定义规则数组（用来区分 info 不算 fail）
 */
function summarize(allResults) {
  const summary = {
    total: allResults.length,
    passCount: 0,
    failCount: 0,
    warnCount: 0,
    bySeverity: { error: 0, warning: 0, info: 0 },
    details: allResults,
  };
  for (const r of allResults) {
    if (r.errors.length > 0) summary.failCount++;
    else summary.passCount++;
    summary.warnCount += r.warnings.length;
    summary.bySeverity.error += r.errors.length;
    summary.bySeverity.warning += r.warnings.length;
    summary.bySeverity.info += r.info.length;
  }
  return summary;
}

module.exports = {
  validateCard,
  validateAll,
  summarize,
};