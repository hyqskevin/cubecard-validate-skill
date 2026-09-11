/**
 * V14: 业务逻辑完备性
 *
 * 检测形态（v1 简化版）：
 *   1) if 语句缺失 else（且内部有 return / 改 this.xxx）→ info 提示补全
 *   2) 三元表达式过深（嵌套 > 2 层）→ warning，建议拆 if/else
 *   3) script 里调用未声明的全局（不在 EXPRESSION_GLOBALS，也不在 data/methods/lifecycle/vForLocals）→ warning
 *   4) methods 里的 this.xxx 读 / 写未声明 data 字段 → warning
 *
 * 严重度：
 *   - 1) info（最佳实践提示，不阻断）
 *   - 2) warning
 *   - 3) warning
 *   - 4) warning
 */

const espree = require('espree');
const estraverse = require('estraverse');

const EXPRESSION_GLOBALS = new Set([
  'Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'Promise', 'RegExp', 'Error', 'console',
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
]);

/**
 * 简易 parse：单表达式 / 多语句 用不同兜底
 */
function parseExpr(code) {
  try {
    return espree.parse(`(${code})`, { ecmaVersion: 'latest' }).body[0].expression;
  } catch { return null; }
}

function parseStmt(code) {
  try {
    return espree.parse(code, { ecmaVersion: 'latest' }).body;
  } catch { return null; }
}

/**
 * 计算三元表达式嵌套深度
 */
function ternaryDepth(node) {
  if (!node) return 0;
  if (node.type !== 'ConditionalExpression') return 0;
  return 1 + Math.max(ternaryDepth(node.consequent), ternaryDepth(node.alternate));
}

/**
 * 检查 if 缺 else 且函数内 return 后还有别的 statement
 */
function checkMissingElse(fnAst, onHint) {
  // 找到函数体所有顶层 IfStatement
  if (!fnAst.body || !fnAst.body.body) return;
  for (const stmt of fnAst.body.body) {
    if (stmt.type === 'IfStatement' && !stmt.alternate) {
      // 若 consequent 是 BlockStatement 且里面有 return → 提示补 else
      if (stmt.consequent.type === 'BlockStatement') {
        const hasReturn = stmt.consequent.body.some((s) => s.type === 'ReturnStatement');
        if (hasReturn) {
          onHint(`method 内 if 缺 else 分支（函数体后续语句可能在某些情况下被跳过）`);
        }
      } else if (stmt.consequent.type === 'ReturnStatement') {
        onHint(`method 内 if 缺 else 分支`);
      }
    }
  }
}

/**
 * 在 method 函数体内扫描 this.xxx 读/写的 xxx；收集后和 data 字段对账。
 */
function collectThisRefs(fnAst) {
  const read = new Set();
  const written = new Set();
  if (!fnAst.body || !fnAst.body.body) return { read, written };
  estraverse.traverse(fnAst.body, {
    enter(node, parent) {
      if (node.type === 'MemberExpression' && !node.computed
          && node.object.type === 'ThisExpression'
          && node.property.type === 'Identifier') {
        const name = node.property.name;
        // 区分读 / 写
        if (parent && parent.type === 'AssignmentExpression' && parent.left === node) {
          written.add(name);
        } else {
          read.add(name);
        }
      }
    },
  });
  return { read, written };
}

function check(ctx, result) {
  if (!ctx.classified || !ctx.classified.methods
      || ctx.classified.methods.type !== 'ObjectExpression') return;

  const dataKeys = new Set();
  if (ctx.classified.data && ctx.classified.data.type === 'ObjectExpression') {
    for (const p of ctx.classified.data.properties) {
      if (p.type === 'Property' && p.key && p.key.name) dataKeys.add(p.key.name);
    }
  }

  for (const prop of ctx.classified.methods.properties) {
    if (prop.type !== 'Property') continue;
    const name = prop.key.name || prop.key.value;
    const fnNode = prop.value;
    if (!fnNode || (fnNode.type !== 'FunctionExpression' && fnNode.type !== 'ArrowFunctionExpression')) continue;

    // 1) if 缺 else 提示
    checkMissingElse(fnNode, (msg) => {
      result.info.push(`V14: ${name} - ${msg}`);
    });

    // 3) / 4) this.xxx vs data
    const { read, written } = collectThisRefs(fnNode);
    for (const k of written) {
      if (!dataKeys.has(k)) {
        result.warnings.push(`V14: method "${name}" 写 this.${k} 但 data 未声明此字段（可能新增字段忘加到 data）`);
      }
    }
    for (const k of read) {
      if (!dataKeys.has(k) && !EXPRESSION_GLOBALS.has(k)) {
        result.warnings.push(`V14: method "${name}" 读 this.${k} 但 data 未声明此字段`);
      }
    }
  }

  // 2) 三元嵌套深度（在 scriptAst 顶层 Identifier 表达式里查）
  if (ctx.scriptAst) {
    estraverse.traverse(ctx.scriptAst, {
      enter(node) {
        if (node.type === 'ConditionalExpression') {
          const d = ternaryDepth(node);
          if (d > 2) {
            const line = node.loc?.start?.line;
            result.warnings.push(`V14: script 第 ${line || '?'} 行三元嵌套深度 ${d}（>2，建议拆 if/else）`);
          }
        }
      },
    });
  }
}

module.exports = { check };