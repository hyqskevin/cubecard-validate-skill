/**
 * V6: v-for 数据源存在性
 *
 * 实现：把 v-for 表达式（如 `(item, idx) in items` / `x in items.foo.bar`）
 * 扔给 espree，找到 `in` 右侧的 Identifier 链（MemberExpression），
 * 提取"根"标识符（最左边的 Identifier），看是否在 data / getter 里。
 *
 * 之前用 /\bin\s+([a-zA-Z_$][a-zA-Z0-9_$.]*)/ 然后 split('.')[0]，
 * 抓不住 `items.foo.bar` 的 items（因为正则字符类不包含 `.`）。
 * 现在 espree 直接解。
 */

const espree = require('espree');

function parseExpression(expr) {
  try {
    return espree.parse(`(${expr})`, { ecmaVersion: 'latest' }).body[0].expression;
  } catch (e) {
    return { __parseError: e.message };
  }
}

/**
 * 从 `x in source` 的 source 节点提取根标识符（最左边的 Identifier）。
 *   - Identifier           → 直接取 name
 *   - MemberExpression     → 递归到 object
 *   - CallExpression       → 取 callee 根（Math.max(...) 等）
 */
function getRootName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getRootName(node.object);
  if (node.type === 'CallExpression') return getRootName(node.callee);
  if (node.type === 'LogicalExpression') return getRootName(node.left) || getRootName(node.right);
  if (node.type === 'ConditionalExpression') return getRootName(node.consequent) || getRootName(node.alternate);
  return null;
}

/**
 * espree 解出来的 v-for 表达式有几种形态：
 *   - (item) in xs           → BinaryExpression(operator:'in')
 *   - (item, idx) in xs      → 同上
 *   - item of xs             → BinaryExpression(operator:'of')（ACT DSL 不支持 of，但解析不能炸）
 *   - v-for="x in xs"        → AST 是 (x in xs) BinaryExpression
 *
 * 表达式里 in 不是合法 JS 二元运算符，所以 espree 会把整段当成
 * BinaryExpression(in) 或 Identifier → 看具体行为。
 */
function splitVFor(expr) {
  // espree 不会把 "x in xs" 当成 BinaryExpression，因为 in 是保留字
  // 在 ES5+ 的关系运算符之外，BinaryExpression 只接受 ==/!=/=== 等。
  // 用保守方式：手写切分第一个 " in "（不在 Identifier 里出现的位置）。
  const m = expr.match(/^([\s\S]*?)\s+in\s+([\s\S]+)$/);
  if (!m) return null;
  const left = m[1].trim();
  const right = m[2].replace(/^of\s+/, '').trim(); // 去掉可能的 "of"
  return { left, right };
}

function check(ctx, result) {
  // 收集 ctx 已有 v-for 局部变量里出现过的"前缀"：todo-app 的内层
  // v-for="(todo, idx) in group.items" 里的 group 是外层 v-for 声明的
  // 局部变量（来自外层 v-for 的第一个参数），需要并入合法集合。
  const localsForSource = new Set(ctx.vForLocals);
  // 同时扫一遍 v-for 表达式的"左侧第一个标识符"（即 v-for 第一个
  // 局部变量），嵌套场景下内层 v-for 的"数据源"可能就是外层的
  // 局部变量 (item / group 等)。ctx.vForLocals 已经覆盖了，但
  // 极端形态如 `(...rest) in xs` 需要从表达式里解析，这里再补：
  for (const el of ctx.elements) {
    for (const attr of el.attrs) {
      if (attr.prefix === 'v-' && attr.key === 'for' && typeof attr.value === 'string') {
        const left = attr.value.split(/\s+in\s+/)[0].replace(/[()]/g, '').split(',')[0].trim();
        if (left) localsForSource.add(left);
      }
    }
  }

  for (const el of ctx.elements) {
    for (const attr of el.attrs) {
      if (!(attr.prefix === 'v-' && attr.key === 'for')) continue;
      if (typeof attr.value !== 'string') continue;
      const split = splitVFor(attr.value);
      if (!split) {
        result.warnings.push(`V6 <${el.tag} v-for>: 表达式无法解析（应为 "item in xs" 形式）`);
        continue;
      }
      const ast = parseExpression(split.right);
      if (ast.__parseError) {
        result.warnings.push(`V6 <${el.tag} v-for>: 数据源无法解析: ${ast.__parseError}`);
        continue;
      }
      const root = getRootName(ast);
      if (!root) {
        result.warnings.push(`V6 <${el.tag} v-for>: 无法提取数据源根标识符`);
        continue;
      }
      const validSet = new Set([...ctx.scriptIdentifiers, ...localsForSource]);
      if (!validSet.has(root)) {
        result.warnings.push(`V6 <${el.tag} v-for>: 数据源 "${root}" 不在 data/methods/getters/v-for 局部中`);
      }
    }
  }
}

module.exports = { check, getRootName, splitVFor };
