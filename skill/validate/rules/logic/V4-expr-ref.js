/**
 * V4: bind 表达式引用合法性
 *
 * 实现：用 espree 9 把 bind 表达式（如 `:value="title + 1"` 或
 * `v-bind:class="theme == 'dark' ? 'a' : 'b'"`）解成 JS AST，
 * 收集所有 Identifier，再跟 ctx.scriptIdentifiers + v-for 局部 +
 * 全局白名单比对。
 *
 * 4.0 升级：用 estraverse 替代手写 AST walker（cube-lint 同款），
 * 并用 eslint-scope 对每个 method 函数体做"未声明局部变量"扫描，
 * 帮开发者发现 `methods: { onX() { let x = 1; return x; } }` 之类
 * 的局部污染陷阱。
 *
 * 表达式引用的合法集合：
 *   - ctx.scriptIdentifiers（data 字段 + methods 名 + 生命周期 + other 名）
 *   - ctx.vForLocals（v-for 的 (item, idx) 这种局部变量）
 *   - EXPRESSION_GLOBALS（Math / Date / JSON / ...）
 *   - 字面量 'this'（ACT DSL this 指合并后的 state）
 */

const espree = require('espree');
const estraverse = require('estraverse');
const eslintScope = require('eslint-scope');

const EXPRESSION_GLOBALS = new Set([
  'Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'Promise', 'RegExp', 'Error', 'console',
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
]);

/**
 * 把 bind 表达式扔给 espree。
 * 表达式是单条（如 `title + 1`），包成 `(${expr})` 后解成 Expression。
 */
function parseExpression(expr) {
  try {
    return espree.parse(`(${expr})`, { ecmaVersion: 'latest' }).body[0].expression;
  } catch (e) {
    return { __parseError: e.message };
  }
}

/**
 * 用 estraverse 收集独立 Identifier：
 *   - MemberExpression 的最左 object 算独立引用（root identifier）
 *   - MemberExpression 的 property / computed.property 不算（路径点）
 *   - Property 短键 `{ a: 1 }` 的 key 不算（除非 computed）
 *   - 形参 / 变量声明名不算
 *   - 其它情况都算独立引用
 */
function collectIdentifiers(ast) {
  const ids = new Set();
  estraverse.traverse(ast, {
    enter(node, parent) {
      if (node.type !== 'Identifier') return;
      // MemberExpression 里只有最左 object 算引用，property 节点不算
      if (parent && parent.type === 'MemberExpression') {
        if (parent.object === node) {
          ids.add(node.name);
        }
        return;
      }
      // Property 短键 { a: 1 } 的 key 不算（computed [a]: 1 算）
      if (parent && parent.type === 'Property' && parent.key === node && !parent.computed) return;
      // 形参 / 变量声明名
      if (parent && (parent.type === 'VariableDeclarator' || parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.id === node) return;
      ids.add(node.name);
    },
  });
  return [...ids];
}

/**
 * 对单个方法函数体做 scope 分析，找出"声明在局部、data 里没有"
 * 的引用（容易出 bug 的局部变量自引用）。
 *
 * 用 eslint-scope 的 analyze：对 FunctionExpression/ArrowFunctionExpression
 * 内部 Identifier 跑作用域分析。resolved=null 且名字不在任何 implicit globals
 * 里 → 报。
 */
function findLocalOnlyReferences(fnAst, ctxScriptIds) {
  if (!fnAst || !fnAst.body) return [];
  // 跳过不含 FunctionExpression 的情形
  try {
    const sm = eslintScope.analyze(fnAst, { ecmaVersion: 'latest', sourceType: 'script', ignoreEval: true });
    const issues = [];
    const fnScopes = sm.acquire(fnAst) ? [sm.acquire(fnAst)] : [];
    // 顶层函数 fnAst 本身就是 FunctionExpression，所以 acquire(fnAst) 是其作用域
    const rootScope = sm.acquire(fnAst);
    if (!rootScope) return [];
    for (const ref of rootScope.references) {
      const name = ref.identifier.name;
      if (name === 'this' || name === 'arguments') continue;
      const resolved = ref.resolved;
      if (resolved) continue; // 函数内 var/let/const 已声明
      // 未声明：检查是否是 EXPR_GLOBALS / ctxScriptIds
      if (EXPRESSION_GLOBALS.has(name)) continue;
      if (ctxScriptIds.has(name)) continue;
      // 否则就是"未声明 + 非全局"——可能是 typo / 漏声明
      issues.push({
        name,
        line: ref.identifier.loc && ref.identifier.loc.start && ref.identifier.loc.start.line,
      });
    }
    return issues;
  } catch (e) {
    return [];
  }
}

function check(ctx, result) {
  // 第一部分：bind 表达式引用合法性（原有逻辑）
  for (const el of ctx.elements) {
    for (const attr of el.attrs) {
      if (!(attr.prefix === ':' || attr.prefix === 'v-bind:')) continue;
      if (typeof attr.value !== 'string') continue;
      const expr = attr.value;
      const ast = parseExpression(expr);
      if (ast.__parseError) {
        result.warnings.push(`V4 <${el.tag} ${attr.prefix}${attr.key}>: 表达式无法解析: ${ast.__parseError}`);
        continue;
      }
      const ids = collectIdentifiers(ast);
      const valid = new Set([...ctx.scriptIdentifiers, ...ctx.vForLocals]);
      for (const id of ids) {
        if (EXPRESSION_GLOBALS.has(id)) continue;
        if (id === 'this') continue;
        if (!valid.has(id)) {
          result.warnings.push(`V4 <${el.tag} ${attr.prefix}${attr.key}>: 表达式引用未定义的 "${id}"`);
        }
      }
    }
  }

  // 第二部分：methods 函数体内的"未声明引用"扫描
  // 对每个 method FunctionExpression 跑 eslint-scope，发现未声明且不在
  // data/methods 白名单里的 Identifier → info，提示开发者可能是 typo。
  const scriptIds = ctx.scriptIdentifiers || new Set();
  if (!ctx.classified || !ctx.classified.methods || ctx.classified.methods.type !== 'ObjectExpression') return;
  for (const prop of ctx.classified.methods.properties) {
    if (prop.type !== 'Property') continue;
    if (!prop.value || (prop.value.type !== 'FunctionExpression' && prop.value.type !== 'ArrowFunctionExpression')) continue;
    const methodName = prop.key.name || prop.key.value;
    const issues = findLocalOnlyReferences(prop.value, scriptIds);
    for (const issue of issues) {
      result.info.push(`V4: method "${methodName}" 第 ${issue.line} 行引用未声明的 "${issue.name}"（非 data/methods/全局）`);
    }
  }
}

module.exports = { check, collectIdentifiers, parseExpression, findLocalOnlyReferences, EXPRESSION_GLOBALS };