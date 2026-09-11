/**
 * 共享上下文：一次解析，V1-V10 共用。
 *
 * 替换之前的"手写正则 + vm 沙箱"路径：
 *   - 整 SFC 文件 → vue-eslint-parser 7.x（出 VElement/VStartTag 树 + JS AST）
 *   - manifest    → V1 用 ajv + JSON Schema 跑
 *
 * ACT 4.0 同款：cube-lint 用 vue-eslint-parser + espree，cube-program 用
 * @vue/compiler-sfc + vue-eslint-parser。这里走前者，单解析器覆盖两种 AST。
 */

const fs = require('node:fs');
const path = require('node:path');
const vueEslintParser = require('vue-eslint-parser');

/**
 * 整 SFC 文件过 vue-eslint-parser。
 * 返回：
 *   - scriptAst:   Program（JS AST，可直接拿 export default）
 *   - templateAst: VElement 树（可拿 v-bind / v-on / v-for / v-if）
 *   - services:    拿源码用
 */
function parseVue(vueContent) {
  try {
    const result = vueEslintParser.parseForESLint(vueContent, {
      // 用数字而非 'latest'：vue-eslint-parser 内部解析 espree 的路径受 cwd 影响，
      // cwd 在项目根时可能拿到只认数字 ecmaVersion 的旧版 espree，'latest' 会报
      // "ecmaVersion must be a number"。卡片 DSL 仅用 ES2020 特性，2020 两端通用。
      ecmaVersion: 2020,
      sourceType: 'module',
    });
    return {
      scriptAst: result.ast,
      templateAst: result.ast.templateBody || null,
      services: result.services,
      tokens: result.tokens,
      vueText: vueContent,
      error: null,
    };
  } catch (e) {
    return { error: e.message, vueText: vueContent };
  }
}

/**
 * 取出 export default {} 这个 ObjectExpression。
 */
function extractCardObjectExpression(scriptAst) {
  if (!scriptAst || !scriptAst.body) return null;
  for (const node of scriptAst.body) {
    if (node.type !== 'ExportDefaultDeclaration') continue;
    if (node.declaration.type !== 'ObjectExpression') return null;
    return node.declaration;
  }
  return null;
}

/**
 * 把 export default 里的 properties 分类。
 *   data / methods / lifecycle / other
 *
 * ACT DSL 形态：export default { data, methods, beforeCreate, didMount, ... }
 */
function classifyProperties(objExpr) {
  const result = {
    data: null,
    methods: null,
    lifecycle: [],
    other: [],
    propertyKeys: [],
  };
  if (!objExpr || objExpr.type !== 'ObjectExpression') return result;
  for (const prop of objExpr.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.name || prop.key.value;
    result.propertyKeys.push(key);
    if (key === 'data') result.data = prop.value;
    else if (key === 'methods') result.methods = prop.value;
    else if (
      typeof key === 'string' &&
      /^[a-z]/.test(key) &&
      (prop.value.type === 'FunctionExpression' || prop.value.type === 'ArrowFunctionExpression')
    ) {
      result.lifecycle.push({ key, node: prop });
    } else {
      result.other.push({ key, node: prop });
    }
  }
  return result;
}

/**
 * VElement → { tag, line, attrs } 扁平化。
 * 递归找所有真元素（VElement），跳过 VText / VStartTag / VEndTag。
 */
function walkTemplateElements(templateAst) {
  const elements = [];
  if (!templateAst) return elements;
  function visit(node) {
    if (!node) return;
    if (node.type === 'VElement') {
      elements.push({
        tag: node.name,
        line: node.loc && node.loc.start && node.loc.start.line,
        rawAttrs: node.startTag && node.startTag.attributes || [],
      });
      for (const child of node.children || []) visit(child);
      return;
    }
    // VFor / VIf / VSlot 等容器节点继续递归
    for (const k of ['children', 'consequent', 'alternate']) {
      const v = node[k];
      if (Array.isArray(v)) for (const c of v) visit(c);
      else if (v && v.type) visit(v);
    }
  }
  visit(templateAst);
  return elements;
}

/**
 * 把 vue-eslint-parser 的 VAttribute 数组转成统一的 attr 描述：
 *   { key, value, prefix, directive }
 *
 * - 普通属性 class="x"      → { key:'class', value:'x', directive:false }
 * - :value / v-bind:value   → { key:'value', value:<expr>, prefix:':', directive:true }
 * - @click / v-on:click      → { key:'click', value:<expr>, prefix:'@', directive:true }
 * - v-for / v-if / v-show   → { key:'for'|'if'|'show', value:<expr>, prefix:'v-', directive:true }
 */
function normalizeAttrs(vAttrs) {
  const out = [];
  for (const a of vAttrs) {
    if (a.type !== 'VAttribute') continue;
    const isDirective = !!a.directive;
    let prefix = '';
    let key = null;
    let value = null;

    if (isDirective) {
      const dirName = a.key.name && a.key.name.name;       // 'bind' / 'on' / 'for' / 'if'
      const rawName = a.key.name && a.key.name.rawName;    // 'v-bind' / 'v-on' / 'v-for' / 'v-if'
      const arg = a.key.argument && a.key.argument.name;    // 'value' / 'click' / undefined
      if (dirName === 'bind') {
        prefix = rawName === 'v-bind' ? 'v-bind:' : ':';
        key = arg;
      } else if (dirName === 'on') {
        prefix = rawName === 'v-on' ? 'v-on:' : '@';
        key = arg;
      } else {
        prefix = 'v-';
        key = dirName;
      }
      if (a.value && a.value.type === 'VExpressionContainer') {
        value = exprContainerToText(a.value);
      } else if (a.value && a.value.type === 'VLiteral') {
        value = a.value.value;
      } else {
        value = true;
      }
    } else {
      // 普通静态属性
      key = a.key.name;
      if (a.value && a.value.type === 'VLiteral') value = a.value.value;
      else value = true;
    }

    out.push({ key, value, prefix, directive: isDirective, raw: a });
  }
  return out;
}

/**
 * 从 VExpressionContainer 拿到内部表达式的"源文本"。
 * vue-eslint-parser 在容器节点上挂了 expression / expression.range，
 * 直接读 range 切原文。
 */
function exprContainerToText(container) {
  if (!container) return '';
  if (container.expression && Array.isArray(container.expression.range)) {
    const [start, end] = container.expression.range;
    // start 是相对于 templateBody 的偏移；templateBody.loc.start.offset
    // 也是相对于它自己的起始。两者一致都是 VElement 树的相对偏移。
    return exprSourceText.slice(start, end);
  }
  return '';
}

// 模块级缓存：当前 parseVue 出来的源码（template 段）。exprContainerToText
// 直接读这里，避免每个 VAttribute 都传一遍大字符串。
let exprSourceText = '';

/**
 * 兜底：vue-eslint-parser 在 v-if/v-for 表达式非法（如含 `;`、`=` 单独）时会
 * "静默丢失"该属性。这里用正则再扫一遍 vueContent，把这些残留属性
 * 补回 ctx.elements 里对应元素上（如果没有该属性的话）。
 */
function collectFallbackAttrs(ctx) {
  if (!ctx.vueContent) return;
  const re = /\b(v-if|v-for|v-show|v-else-if|v-else)(=("[^"]*"|'[^']*'))?/g;
  let m;
  while ((m = re.exec(ctx.vueContent)) !== null) {
    const directive = m[1];
    const quoted = m[3];
    if (!quoted) continue; // 没有 = 的不算有表达式
    const expr = quoted.slice(1, -1);
    // 找出该属性所在元素（按行）
    const lineNum = ctx.vueContent.slice(0, m.index).split('\n').length;
    const target = ctx.elements.find((el) => el.line === lineNum);
    if (!target) continue;
    // 已存在该指令就不重复
    const exists = target.attrs.some((a) => a.prefix === 'v-' && a.key === directive.slice(2));
    if (exists) continue;
    target.attrs.push({
      key: directive.slice(2),
      value: expr,
      prefix: 'v-',
      directive: true,
      raw: null,
    });
  }
}

/**
 * 顶层入口：构建一张卡片的所有 AST 上下文。
 */
function buildContext(cardPath) {
  const cardName = path.basename(cardPath);
  const ctx = {
    cardName,
    cardPath,
    manifestRaw: null,
    manifestObj: null,
    manifestAst: null,   // json-to-ast-ext 出来的带 loc 节点
    manifestError: null,
    vueContent: '',
    parsed: null,
    scriptAst: null,
    templateAst: null,
    cardObjectExpr: null,
    classified: null,
    scriptIdentifiers: new Set(),
    elements: [],     // [{ tag, line, attrs: [...] }]
    vForLocals: new Set(),
    parseError: null,
    // 块标签行号，给 V10 用
    blockLines: { template: null, script: null, style: null },
  };

  // manifest：用 comment-json 允许 // ... 注释（cube-meta 同款）；
  // 同时用 json-to-ast-ext 解出带 loc 的 AST，让 V1 能报"字段在第几行"。
  const manifestPath = path.join(cardPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    ctx.manifestRaw = fs.readFileSync(manifestPath, 'utf8');
    try {
      ctx.manifestObj = require('comment-json').parse(ctx.manifestRaw);
    } catch (e) {
      ctx.manifestError = e.message;
    }
    try {
      ctx.manifestAst = require('json-to-ast-ext').parse(ctx.manifestRaw, {
        loc: true,
        source: 'manifest.json',
      });
    } catch (e) {
      // manifestAst 解析失败不阻塞：comment-json 已经报错；
      // V1 会从 ctx.manifestError 拿到行号信息
    }
  }

  // .vue
  const mainVue = path.join(cardPath, 'main.vue');
  if (!fs.existsSync(mainVue)) {
    ctx.parseError = 'main.vue 不存在';
    return ctx;
  }
  ctx.vueContent = fs.readFileSync(mainVue, 'utf8');
  ctx.parsed = parseVue(ctx.vueContent);
  if (ctx.parsed.error) {
    ctx.parseError = `vue 解析失败: ${ctx.parsed.error}`;
    return ctx;
  }

  // 设置 exprSourceText（template 段偏移）
  // vue-eslint-parser 的 VElement.range 是相对 SFC 全文的偏移。
  // 但 VExpressionContainer.expression.range 是相对 templateBody 的。
  // 为简单起见，我们把 template 段文本存好；VElement 的范围对 line 没用。
  exprSourceText = ctx.vueContent;

  // 扫 main.vue 里的 <template>/<script>/<style> 起始行号，给 V10 用
  for (const tag of ['template', 'script', 'style']) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`);
    const m = ctx.vueContent.match(re);
    if (m) ctx.blockLines[tag] = ctx.vueContent.slice(0, m.index).split('\n').length;
  }

  ctx.scriptAst = ctx.parsed.scriptAst;
  ctx.templateAst = ctx.parsed.templateAst;
  ctx.cardObjectExpr = extractCardObjectExpression(ctx.scriptAst);
  ctx.classified = classifyProperties(ctx.cardObjectExpr);

  // scriptIdentifiers：data 字段 + methods 名 + 生命周期名 + other 名
  const ids = new Set();
  for (const k of ctx.classified.propertyKeys) ids.add(k);
  if (ctx.classified.data && ctx.classified.data.type === 'ObjectExpression') {
    for (const p of ctx.classified.data.properties) {
      if (p.type === 'Property') ids.add(p.key.name || p.key.value);
    }
  }
  if (ctx.classified.methods && ctx.classified.methods.type === 'ObjectExpression') {
    for (const p of ctx.classified.methods.properties) {
      if (p.type === 'Property') ids.add(p.key.name || p.key.value);
    }
  }
  ctx.scriptIdentifiers = ids;

  // template elements
  const elements = walkTemplateElements(ctx.templateAst);
  ctx.elements = elements.map((e) => ({
    tag: e.tag,
    line: e.line,
    attrs: normalizeAttrs(e.rawAttrs),
  }));

  // 兜底：vue-eslint-parser 在 v-if 表达式非法时会"静默丢失"该属性。
  // 用正则再扫一遍 v-if/v-for/v-show，从源码里把这种残留的属性捡出来。
  collectFallbackAttrs(ctx);

  // v-for 局部变量
  for (const el of ctx.elements) {
    for (const a of el.attrs) {
      if (a.prefix === 'v-' && a.key === 'for' && typeof a.value === 'string') {
        const m = a.value.match(/^\s*\(?([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\)?\s+in\s+/);
        if (m) for (const name of m.slice(1).filter(Boolean)) ctx.vForLocals.add(name);
      }
    }
  }

  return ctx;
}

module.exports = {
  buildContext,
  parseVue,
  extractCardObjectExpression,
  classifyProperties,
  walkTemplateElements,
  normalizeAttrs,
  // 供调试/规则使用
  get exprSourceText() { return exprSourceText; },
};
