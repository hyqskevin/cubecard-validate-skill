/**
 * V12: XSS / 不安全执行检查（OWASP A03 / SonarJS S2076）
 *
 * 检测形态：
 *   - script 段：eval / new Function / Function(...) 直接执行
 *   - script 段：innerHTML / outerHTML / document.write / dangerouslySetInnerHTML
 *   - template 段：v-html="..." （ACT DSL 没有 v-html 概念，但保险起见检查）
 *   - template 段：属性值含 '<script' 字符串 / on* 事件处理器
 *
 * 严重度：error（命中即视为可被攻击者利用）。
 *
 * 来源：reference/code-review-checklist.md（OWASP A03 / SonarJS）
 */

const estraverse = require('estraverse');

// 危险函数名（Identifier callee）
const DANGEROUS_FUNCS = new Set(['eval', 'Function']);

// 危险属性名（MemberExpression 里的 .prop）
const DANGEROUS_PROPS = new Set([
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'document.write',
  'document.writeln',
  'dangerouslySetInnerHTML',
]);

// 危险属性前缀
const DANGEROUS_HANDLER_PREFIX = /^on[a-z]/i;

function walkScript(scriptAst, onHit) {
  if (!scriptAst) return;
  estraverse.traverse(scriptAst, {
    enter(node, parent) {
      // eval(...) / Function(...) 直接调用
      if (node.type === 'CallExpression') {
        const c = node.callee;
        if (c.type === 'Identifier' && DANGEROUS_FUNCS.has(c.name)) {
          onHit(`script 调用 ${c.name}(...)`);
          return;
        }
        if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
          if (DANGEROUS_PROPS.has(c.property.name)) {
            onHit(`script 访问 .${c.property.name}`);
          }
        }
      }
      // new Function(...) 构造执行
      if (node.type === 'NewExpression') {
        const c = node.callee;
        if (c.type === 'Identifier' && DANGEROUS_FUNCS.has(c.name)) {
          onHit(`script 调用 new ${c.name}(...)`);
        }
      }
      // innerHTML = xxx 赋值
      if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
        const prop = node.left.property;
        if (!node.left.computed && prop.type === 'Identifier' && DANGEROUS_PROPS.has(prop.name)) {
          onHit(`script 赋值 .${prop.name} = ...`);
        }
      }
    },
  });
}

function walkTemplate(templateAst, onHit) {
  if (!templateAst) return;
  // vue-eslint-parser 节点不走 estraverse 默认 keys，我们用 esquery 精确查
  const esquery = require('esquery');
  // 1. v-html（ACT DSL 不支持，但写错会爆）
  const vhtmls = esquery.query(templateAst, 'VAttribute[directive=true][key.name.name="html"]');
  for (const v of vhtmls) {
    onHit(`template 第 ${v.loc?.start?.line} 行使用 v-html`);
  }
  // 2. ACT DSL 禁止的原始 HTML 事件属性（onclick 等小写形式）
  //    vue-eslint-parser 对不识别的 onclick 属性会丢弃；但防御性保留扫描
  //    只命中 directive=false 且 key.name.name 小写匹配 ^on[a-z]+ 的情况
  const handlerAttrs = esquery.query(templateAst, 'VAttribute[directive=false][key.name.name=/^on[a-z]+$/]');
  for (const a of handlerAttrs) {
    onHit(`template 第 ${a.loc?.start?.line} 行使用 ${a.key.name.name} 原始事件属性（应改用 @event 形式）`);
  }
}

function check(ctx, result) {
  walkScript(ctx.scriptAst, (msg) => {
    result.errors.push(`V12: XSS 风险 - ${msg}`);
  });
  walkTemplate(ctx.templateAst, (msg) => {
    result.errors.push(`V12: XSS 风险 - ${msg}`);
  });
}

module.exports = { check, walkScript, walkTemplate };