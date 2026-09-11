/**
 * V9: 死代码检测
 *
 * 实现：扫描 .vue 模板段里出现过的标识符，对照 data / methods 名，
 * 把"只在 <script> 里出现、未在模板中出现"的字段报 info。
 *
 * 4.0 升级：用 estraverse 扫 scriptAst，统计 data/methods 内引用过
 * 的所有 Identifier / MemberExpression 链；用 esquery 在 templateAst
 * 里直接命中 v-bind / v-on 上的 expression。两者 union 后再去 data
 * /methods 名对，看哪些"只定义、不被读"——更准，不再误报 `data.foo`
 * 里的 `foo`（因为只收集外层 Identifier 不收集 . 后面的 Property）。
 */

const estraverse = require('estraverse');
const esquery = require('esquery');

// vue-eslint-parser 节点的 children 字段表（estraverse 默认不认识 V* 节点）。
// 同时排除 parent（vue 节点会反向指 parent，会引发栈溢出）。
const VUE_NODE_KEYS = {
  VElement: ['startTag', 'children', 'endTag'],
  VStartTag: ['attributes'],
  VEndTag: [],
  VAttribute: ['key', 'value'],
  VDirectiveKey: ['name', 'argument'],
  VIdentifier: [],
  VExpressionContainer: ['expression'],
  VOnExpression: ['body'],
  VDocumentFragment: ['children'],
  VTextNode: [],
  VFilter: ['callee', 'arguments'],
  VFilterSequenceExpression: ['expression'],
  VForExpression: ['left', 'right'],
  VSlotScopeExpression: ['params'],
};

function extractTemplateText(vueContent) {
  const m = vueContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  return m ? m[1] : '';
}

/**
 * 收集 scriptAst 里被读到的"外层 Identifier"。
 * MemberExpression 链里只取最左 root；Property 短键不算。
 */
function collectReferencedIds(scriptAst) {
  const ids = new Set();
  if (!scriptAst) return ids;
  try {
    estraverse.traverse(scriptAst, {
      enter(node, parent) {
        if (node.type !== 'Identifier') return;
        if (parent && parent.type === 'MemberExpression' && parent.object === node) {
          ids.add(node.name);
          return;
        }
        if (parent && parent.type === 'Property' && parent.key === node && !parent.computed) return;
        if (parent && parent.type === 'MethodDefinition') return;
        ids.add(node.name);
      },
      keys: VUE_NODE_KEYS,
      fallback: 'iteration',
    });
  } catch (e) {
    // 兜底
  }
  return ids;
}

/**
 * 收集 templateAst 里 v-bind / v-on / 模板插值（{{ }}）上的 expression
 * 文本里的标识符。
 *
 * 注意：vue-eslint-parser 的 VAttribute / VExpressionContainer 不是
 * ESTree 节点，estraverse 默认不识别。我们给 estraverse 注入 vue
 * 节点的 children keys（VUE_NODE_KEYS），同时排除 parent 字段
 * 防止反向递归爆栈。
 */
function collectTemplateIds(templateAst) {
  const ids = new Set();
  if (!templateAst) return ids;

  // 1. v-bind / v-on：取 VAttribute.value.expression
  const directives = esquery.query(templateAst, ':matches(VAttribute[key.name.name=/^(bind|on)$/])');
  for (const dir of directives) {
    const value = dir.value;
    if (!value || value.type !== 'VExpressionContainer') continue;
    walkExpr(value.expression, ids);
  }
  // 2. 模板插值（{{ }}）：取 VExpressionContainer.expression
  const mustaches = esquery.query(templateAst, 'VExpressionContainer');
  for (const m of mustaches) {
    if (!m.expression) continue;
    walkExpr(m.expression, ids);
  }
  return ids;
}

/**
 * 给 ESTree 表达式走 estraverse，注入 vue keys 兼容 VOnExpression 之类。
 */
function walkExpr(node, ids) {
  if (!node) return;
  try {
    estraverse.traverse(node, {
      enter(n) {
        if (n.type === 'Identifier') ids.add(n.name);
      },
      keys: VUE_NODE_KEYS,
      fallback: 'iteration',
    });
  } catch (e) {
    // 忽略单个表达式解析失败
  }
}

function check(ctx, result) {
  if (!ctx.classified) return;
  const scriptRefs = collectReferencedIds(ctx.scriptAst);
  const templateRefs = collectTemplateIds(ctx.templateAst);

  // 合并"实际被读"的标识符集合
  const used = new Set([...scriptRefs, ...templateRefs]);
  // 也加上 v-for 局部变量名（v-for 里局部变量算"被使用"，但本规则不打算包含）
  // 不过 v-for 局部名不在 scriptIdentifiers 里，所以不需要单独加。

  // data 字段
  if (ctx.classified.data && ctx.classified.data.type === 'ObjectExpression') {
    for (const p of ctx.classified.data.properties) {
      if (p.type !== 'Property') continue;
      const key = p.key.name || p.key.value;
      if (!used.has(key)) {
        result.info.push(`V9: data 字段 "${key}" 未在模板或脚本中被使用`);
      }
    }
  }
  // methods 名：被 @click / v-on:click 引用或脚本中调用算"使用"
  if (ctx.classified.methods && ctx.classified.methods.type === 'ObjectExpression') {
    for (const p of ctx.classified.methods.properties) {
      if (p.type !== 'Property') continue;
      const key = p.key.name || p.key.value;
      if (!used.has(key)) {
        result.info.push(`V9: methods "${key}" 未被引用（不在 @xxx 或脚本调用）`);
      }
    }
  }
}

module.exports = { check, collectReferencedIds, collectTemplateIds };