/**
 * V22: text / external-richtext 不可嵌套
 *
 * 依据 mPaaS 蚂蚁动态卡片官方文档：
 *   - <text>：只能包含文本值（可用 {{}} 插值），不可嵌套任何其他组件
 *     （help.aliyun.com/zh/document_detail/342782.html）
 *   - <external-richtext>：渲染富文本，同样不可嵌套其他组件
 *     （help.aliyun.com/en/document_detail/342784.html）
 *
 * 检测：这些标签内出现子元素（VElement）即违规。
 * text 内的 {{}} 插值（VExpressionContainer）与裸文本（VText）不算嵌套。
 *
 * 严重度：warning
 */

// 不可嵌套任何其它组件的"文本类"标签
const NON_NESTABLE_TAGS = new Set(['text', 'external-richtext']);

function check(ctx, result) {
  if (!ctx.templateAst) return;

  function visit(node) {
    if (!node) return;
    // 命中文本类标签：检查其子节点里是否有真实组件
    if (node.type === 'VElement' && NON_NESTABLE_TAGS.has(node.name)) {
      for (const child of node.children || []) {
        if (child.type === 'VElement') {
          const line = (child.loc && child.loc.start && child.loc.start.line) ||
            (node.loc && node.loc.start && node.loc.start.line) || '?';
          result.warnings.push(`V22: <${node.name}> 第 ${line} 行不可嵌套组件 <${child.name}>（该标签只能包含文本，富文本请用 external-richtext）`);
          // 已报一条即可，避免重复刷屏；继续往更深层递归
        }
      }
    }
    for (const key of ['children', 'consequent', 'alternate']) {
      const v = node[key];
      if (Array.isArray(v)) for (const c of v) visit(c);
      else if (v && v.type) visit(v);
    }
  }

  visit(ctx.templateAst);
}

module.exports = { check, NON_NESTABLE_TAGS };