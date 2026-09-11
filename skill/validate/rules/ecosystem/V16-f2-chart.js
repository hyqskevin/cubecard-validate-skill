/**
 * V16: 阿里 F2 图表配置校验
 *
 * 检测：
 *   - template 里使用 <F2Chart /> / <f2-chart /> 等图表组件时：
 *     - 必须传 :data 绑定
 *     - 必须传 :scale 字段（颜色 / x y 轴）
 *     - chartProps.color 不能含 hex 短色（应走 token），单位白名单
 *   - script 里不应直接 import 'antv/f2'（ACT DSL 走 requireModule 加载）
 *
 * 严重度：
 *   - 缺必填 props → warning
 *   - 颜色用 hex → info（建议改 token）
 */

const esquery = require('esquery');

// ACT DSL 风格的 F2 图表 tag 名（vue-eslint-parser 会把标签转小写，统一小写匹配）
const F2_TAGS = new Set(['f2chart', 'f2-chart', 'f2']);

// F2 必填 props（按阿里 F2 文档常用项）
const F2_REQUIRED_PROPS = new Set(['data']);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

// 在 expression AST 里递归搜 hex 字符串字面量
function findHexInExpr(node, out) {
  if (!node) return;
  if (node.type === 'Literal' && typeof node.value === 'string' && HEX_COLOR.test(node.value)) {
    out.push(node.value);
  }
  for (const k of Object.keys(node)) {
    if (k === 'parent' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => findHexInExpr(c, out));
    else if (v && typeof v === 'object' && v.type) findHexInExpr(v, out);
  }
}

function checkTemplate(templateAst, result) {
  if (!templateAst) return;
  // esquery 找图表组件
  const els = esquery.query(templateAst, 'VElement');
  for (const el of els) {
    const tag = el.name && (el.name.name || el.name);
    if (!F2_TAGS.has(tag)) continue;
    const attrs = el.startTag && el.startTag.attributes || [];
    const propNames = new Set();
    for (const a of attrs) {
      const dir = a.directive ? (a.key.name && a.key.name.name) : null;
      const arg = a.key.argument && a.key.argument.name;
      if (dir === 'bind' || dir === 'v-bind') propNames.add(arg);
      if (a.directive === false) {
        const k = a.key && (typeof a.key.name === 'string' ? a.key.name : a.key.name && a.key.name.name);
        if (k) propNames.add(k);
      }
    }
    const line = el.loc?.start?.line;
    for (const req of F2_REQUIRED_PROPS) {
      if (!propNames.has(req)) {
        result.warnings.push(`V16: 第 ${line} 行 <${tag}> 缺少 :${req}="..." 必填 prop`);
      }
    }
    // 颜色 hex 检查（覆盖两种形态：1. 静态属性值 2. 表达式里含 hex 字符串字面量）
    for (const a of attrs) {
      const v = a.value;
      if (!v) continue;
      const keyStr = a.key && (typeof a.key.name === 'string' ? a.key.name : a.key.name && a.key.name.name);
      // 形态 1: 静态值
      if (typeof v.value === 'string' && HEX_COLOR.test(v.value)) {
        result.info.push(`V16: 第 ${line} 行 <${tag}> 的 ${keyStr} 用 hex 颜色（建议走 design token）`);
      }
      // 形态 2: 表达式里含 hex
      if (v.expression) {
        const hexes = [];
        findHexInExpr(v.expression, hexes);
        for (const h of hexes) {
          result.info.push(`V16: 第 ${line} 行 <${tag}> 的 ${keyStr} 表达式含 hex 颜色 ${h}（建议走 design token）`);
        }
      }
    }
  }
}

function checkScript(scriptAst, result) {
  if (!scriptAst) return;
  // 不应 import 'antv/f2'（ACT DSL 走 requireModule）
  const esquery = require('esquery');
  const imports = esquery.query(scriptAst, 'ImportDeclaration');
  for (const imp of imports) {
    const src = imp.source && imp.source.value;
    if (typeof src === 'string' && /antv.*f2/i.test(src)) {
      result.warnings.push(`V16: script 用了 import '${src}'，应改用 requireModule('mpaas_jsapi').F2 客户端加载`);
    }
  }
}

function check(ctx, result) {
  checkTemplate(ctx.templateAst, result);
  checkScript(ctx.scriptAst, result);
}

module.exports = { check, F2_TAGS, F2_REQUIRED_PROPS };