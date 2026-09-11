/**
 * V7: v-if 表达式合法性
 *
 * 实现：用 espree 解 v-if 表达式，要求：
 *   - 不能是语句序列（不能含 `;` 在顶层——在表达式语境下其实不可能，
 *     espree 会拒绝带 ; 的 Expression）
 *   - 不能是赋值（顶层是 AssignmentExpression 报 error）
 *   - 顶层允许：BinaryExpression / LogicalExpression / UnaryExpression /
 *     ConditionalExpression / Identifier / MemberExpression / CallExpression /
 *     ArrowFunctionExpression（`items => items.length > 0`）
 *
 * 之前用正则剥字符串、剥 `=>`、剥比较运算符然后看单个 `=`，
 * 思路对了但实现脆；espree 直接判断 AST 类型更准。
 */

const espree = require('espree');

function parseExpression(expr) {
  try {
    return espree.parse(`(${expr})`, { ecmaVersion: 'latest' }).body[0].expression;
  } catch (e) {
    return { __parseError: e.message };
  }
}

function isInvalidTopLevel(ast) {
  if (!ast || !ast.type) return null;
  switch (ast.type) {
    case 'AssignmentExpression':
      return 'v-if 不应是赋值表达式';
    case 'SequenceExpression':
      return 'v-if 不能是语句序列';
    case 'UpdateExpression':
      return 'v-if 不应是自增/自减表达式';
    default:
      return null;
  }
}

function check(ctx, result) {
  for (const el of ctx.elements) {
    for (const attr of el.attrs) {
      if (!(attr.prefix === 'v-' && (attr.key === 'if' || attr.key === 'show'))) continue;
      if (typeof attr.value !== 'string') continue;
      const expr = attr.value;
      // 先看是不是分号分隔的多语句：表达式语境下 `;` 不合法，但 espree
      // 会把它当 Unexpected token。提前判断并报"语句序列"。
      if (/;/.test(expr.replace(/"[^"]*"|'[^']*'/g, ''))) {
        result.errors.push(`V7 <${el.tag} ${attr.key}>: v-if 不能是语句序列`);
        continue;
      }
      const ast = parseExpression(expr);
      if (ast.__parseError) {
        // 解析失败：常见原因是 `x = 1; y = 2` 之类（被前一步漏掉）或
        // 完全不合法表达式。给一个保守的 error。
        result.errors.push(`V7 <${el.tag} ${attr.key}>: 表达式无法解析: ${ast.__parseError}`);
        continue;
      }
      const invalid = isInvalidTopLevel(ast);
      if (invalid) {
        result.errors.push(`V7 <${el.tag} ${attr.key}>: ${invalid}`);
      }
      // 表达式引用合法性（跟 V4 一致）
      const { collectIdentifiers, EXPRESSION_GLOBALS } = require('./V4-expr-ref');
      const ids = collectIdentifiers(ast);
      const valid = new Set([...ctx.scriptIdentifiers, ...ctx.vForLocals]);
      for (const id of ids) {
        if (EXPRESSION_GLOBALS.has(id) || id === 'this') continue;
        if (!valid.has(id)) {
          result.warnings.push(`V7 <${el.tag} ${attr.key}>: 表达式引用未定义的 "${id}"`);
        }
      }
    }
  }
}

module.exports = { check, isInvalidTopLevel };
