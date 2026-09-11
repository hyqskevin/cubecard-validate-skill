/**
 * V5: 事件方法存在性
 *
 * 实现：把事件表达式（如 `onClick()` / `onFilter('all')` /
 * `onDelete(gIdx, idx)`）扔给 espree 解 AST，找到入口
 * Identifier，看它是否在 ctx.scriptIdentifiers.methods 里。
 *
 * 4.0 升级：用 eslint-scope 对内联在 @xxx 上的"匿名函数体"（如
 * `@input="value => search(value)"`）做局部未声明引用扫描，
 * 防止 v-for 局部变量名跟外层 method 撞名。
 */

const espree = require('espree');
const eslintScope = require('eslint-scope');

const EXPRESSION_GLOBALS = new Set([
  'Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'Promise', 'RegExp', 'Error', 'console',
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
]);

function parseExpression(expr) {
  try {
    return espree.parse(`(${expr})`, { ecmaVersion: 'latest' }).body[0].expression;
  } catch (e) {
    return { __parseError: e.message };
  }
}

function findRootMethodName(ast) {
  if (!ast || !ast.type) return null;
  if (ast.type === 'CallExpression') {
    const c = ast.callee;
    if (c.type === 'Identifier') return c.name;
    if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
      return c.property.name;
    }
  }
  if (ast.type === 'Identifier') return ast.name;
  return null;
}

/**
 * 如果事件表达式是内联箭头函数（如 `value => search(value)` 或
 * `function(e) { ... }`），对函数体做 eslint-scope。
 *
 * 当前 ACT DSL 产物形态是 `this.fn.bind(this, ...)`，但写卡的人在
 * .vue 源码里也可以写 `@click = "value => handle(value)"`。这两种
 * 都要被覆盖。
 */
function findInlineFnIssues(expr, scriptIds) {
  let ast;
  try {
    ast = espree.parse(`(${expr})`, { ecmaVersion: 'latest' }).body[0].expression;
  } catch { return []; }
  if (!ast || (ast.type !== 'ArrowFunctionExpression' && ast.type !== 'FunctionExpression')) return [];
  try {
    const sm = eslintScope.analyze(ast, { ecmaVersion: 'latest', sourceType: 'script', ignoreEval: true });
    const scope = sm.acquire(ast);
    if (!scope) return [];
    const issues = [];
    for (const ref of scope.references) {
      const name = ref.identifier.name;
      if (name === 'this' || name === 'arguments') continue;
      if (ref.resolved) continue;
      if (EXPRESSION_GLOBALS.has(name)) continue;
      if (scriptIds.has(name)) continue;
      issues.push({
        name,
        line: ref.identifier.loc && ref.identifier.loc.start && ref.identifier.loc.start.line,
      });
    }
    return issues;
  } catch {
    return [];
  }
}

function check(ctx, result) {
  // 取 methods 字段名集合
  const methodNames = new Set();
  if (ctx.classified && ctx.classified.methods && ctx.classified.methods.type === 'ObjectExpression') {
    for (const p of ctx.classified.methods.properties) {
      if (p.type === 'Property') methodNames.add(p.key.name || p.key.value);
    }
  }

  const scriptIds = ctx.scriptIdentifiers || new Set();

  for (const el of ctx.elements) {
    for (const attr of el.attrs) {
      if (!(attr.prefix === '@' || attr.prefix === 'v-on:')) continue;
      if (typeof attr.value !== 'string') continue;
      const ast = parseExpression(attr.value);
      if (ast.__parseError) {
        result.warnings.push(`V5 <${el.tag} ${attr.prefix}${attr.key}>: 表达式无法解析: ${ast.__parseError}`);
        continue;
      }
      const name = findRootMethodName(ast);
      if (!name) {
        // 可能是内联匿名函数；继续往下做 inline 检查
      } else if (!methodNames.has(name)) {
        result.warnings.push(`V5 <${el.tag} ${attr.prefix}${attr.key}>: 引用未定义的 method "${name}"`);
      }
      // 内联函数体的未声明引用扫描
      const issues = findInlineFnIssues(attr.value, scriptIds);
      for (const issue of issues) {
        result.info.push(`V5 <${el.tag} ${attr.prefix}${attr.key}>: 内联函数第 ${issue.line} 行引用未声明的 "${issue.name}"`);
      }
    }
  }
}

module.exports = { check, findRootMethodName, findInlineFnIssues };