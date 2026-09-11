/**
 * V15: JSDoc 注释
 *
 * 检测：
 *   - methods 里每个 method 必须有 JSDoc 注释
 *   - lifecycle 钩子（beforeCreate / didMount / didAppear 等）必须有 JSDoc
 *   - data 字段：可选（info），至少顶层字段建议加
 *
 * 实现：从 ctx.vueContent 切片拿 script 段，对每个 method/lifecycle 函数的
 * 起始行往前看 N 行找 jsdoc 注释。
 *
 * 严重度：
 *   - methods 缺 JSDoc → warning
 *   - lifecycle 缺 JSDoc → warning
 *   - data 字段缺 JSDoc → info（建议）
 */

const fs = require('node:fs');

function extractScript(vueContent) {
  const m = vueContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : null;
}

function hasJSDocBefore(scriptText, lineNumber /* 1-based */) {
  // lineNumber 是目标语句行号；往上扫最多 10 行找 /** 开头 */ 结尾
  const lines = scriptText.split('\n');
  let i = lineNumber - 2; // lineNumber 前一行索引（0-based）
  let endIdx = -1;
  // 倒着找最近的 */ 闭合
  let windowLines = [];
  for (let k = Math.max(0, lineNumber - 2); k >= Math.max(0, lineNumber - 12); k--) {
    windowLines.unshift(lines[k]);
    if (/^\s*\*\//.test(lines[k])) {
      endIdx = k;
      break;
    }
  }
  if (endIdx < 0) return false;
  // 从 endIdx 往上找 /**
  for (let k = endIdx; k >= Math.max(0, endIdx - 15); k--) {
    if (/\/\*\*/.test(lines[k])) return true;
  }
  return false;
}

function lineOf(scriptText, target /* substring */) {
  const idx = scriptText.indexOf(target);
  if (idx < 0) return -1;
  return scriptText.slice(0, idx).split('\n').length;
}

function check(ctx, result) {
  const vueContent = ctx.vueContent || '';
  const scriptText = extractScript(vueContent);
  if (!scriptText) return;

  // methods
  if (ctx.classified && ctx.classified.methods && ctx.classified.methods.type === 'ObjectExpression') {
    for (const p of ctx.classified.methods.properties) {
      if (p.type !== 'Property') continue;
      const name = p.key.name || p.key.value;
      const line = p.value?.loc?.start?.line;
      if (!line) continue;
      if (!hasJSDocBefore(scriptText, line)) {
        result.warnings.push(`V15: method "${name}" 缺少 JSDoc 注释（/** ... */）`);
      }
    }
  }

  // lifecycle
  if (ctx.classified && Array.isArray(ctx.classified.lifecycle)) {
    for (const item of ctx.classified.lifecycle) {
      const name = item.key;
      const line = item.node?.value?.loc?.start?.line;
      if (!line) continue;
      if (!hasJSDocBefore(scriptText, line)) {
        result.warnings.push(`V15: lifecycle "${name}" 缺少 JSDoc 注释`);
      }
    }
  }

  // data 字段（info 建议）
  if (ctx.classified && ctx.classified.data && ctx.classified.data.type === 'ObjectExpression') {
    for (const p of ctx.classified.data.properties) {
      if (p.type !== 'Property') continue;
      const name = p.key.name || p.key.value;
      const line = p.loc?.start?.line;
      if (!line) continue;
      if (!hasJSDocBefore(scriptText, line)) {
        result.info.push(`V15: data 字段 "${name}" 建议加 JSDoc 说明类型/默认值`);
      }
    }
  }
}

module.exports = { check, hasJSDocBefore };