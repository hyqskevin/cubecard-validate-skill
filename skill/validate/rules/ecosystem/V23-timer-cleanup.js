/**
 * V22: 定时器生命周期清理
 *
 * ACT 卡片在 didMount 里启动 setTimeout / setInterval 后，必须在 didDisappear
 * 里调用对应的 clearTimeout / clearInterval 把它们清掉，否则卡片销毁时
 * 回调仍会触发，容易出现「对已卸载组件的 state 赋值」之类的脏操作。
 *
 * 检测形态：
 *   1) script 顶层或 methods 内出现 setTimeout / setInterval 的赋值形如
 *      `this.xxxTimer = setTimeout(...)` / `this.xxxTimer = setInterval(...)`
 *      → 收集 timer 变量名（不要求 this.xxx；普通 const 也算，但只对 this.xxx 给提示）
 *   2) script 中存在 didDisappear 函数，且该函数体里出现过 clearTimeout /
 *      clearInterval  → 视为「已清理」
 *   3) 任意 setTimeout/setInterval 出现，但 didDisappear 不存在或没清 timer
 *      → 报 warning（提示需要清理）
 *
 * options（JSON 配置）：
 *   - warnOnly: boolean，是否只给警告而非 error（默认 true，避免误杀）
 */

const estraverse = require('estraverse');

const TIMER_NAMES = ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];

function hasTimerCall(ast) {
  let found = false;
  estraverse.traverse(ast, {
    enter(node) {
      if (found) return;
      if (node.type === 'CallExpression'
          && node.callee.type === 'Identifier'
          && TIMER_NAMES.includes(node.callee.name)) {
        found = true;
      }
    },
  });
  return found;
}

function check(ctx, result) {
  if (!ctx.scriptAst || !ctx.cardObjectExpr) return;

  const opts = ctx._ruleOptions || {};
  const warnOnly = opts.warnOnly !== false; // 默认 true
  const sev = warnOnly ? result.warnings : result.errors;

  // 1. 收集 didDisappear 函数体是否调用 clearTimeout / clearInterval
  let hasCleanup = false;
  if (Array.isArray(ctx.classified?.lifecycle)) {
    for (const { key, node } of ctx.classified.lifecycle) {
      if (key !== 'didDisappear') continue;
      // node.prop.value 是 FunctionExpression / ArrowFunctionExpression
      const fn = node && node.value;
      if (fn && (fn.type === 'FunctionExpression' || fn.type === 'ArrowFunctionExpression')) {
        const body = fn.body;
        if (body && hasTimerCall(body)) {
          hasCleanup = true;
          break;
        }
      }
    }
  }

  // 2. 检测是否使用过 setTimeout / setInterval
  const usesTimer = hasTimerCall(ctx.scriptAst);

  if (usesTimer && !hasCleanup) {
    sev.push('V23: 检测到 setTimeout / setInterval 但未实现 didDisappear 清理；卡片销毁时定时器回调可能触发，建议在 didDisappear 里 clearTimeout / clearInterval');
  }
}

module.exports = { check, TIMER_NAMES };
