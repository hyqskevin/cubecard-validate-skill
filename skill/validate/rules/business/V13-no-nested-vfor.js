/**
 * V13: v-for 不能嵌套 v-for
 *
 * ACT Cube DSL 内部规范：cube-card 不允许 v-for 嵌套。
 * 检测方式：vue-eslint-parser 的 vfor 描述符在 .json 产物里走 ctx.elements
 * （来自 v-for 指令）；.vue 源码里走 ctx.templateAst（vue 节点）。
 *
 * 两个入口都查：任意一个祖先链上出现 v-for 即视为嵌套。
 */

function hasAncestorVFor(templateAst, node, depth = 0) {
  // vue-eslint-parser 把 v-for 节点包成 VForExpression /
  // 直接在 VElement.startTag 上有 vForDirective / directive 等
  // 简化：向上找 parent 链，任意一级有 vfor/vFor 即视为嵌套
  if (depth > 200) return false; // 防环
  const parent = node.parent;
  if (!parent) return false;
  if (parent.vfor || parent.vFor) return true;
  // 部分 vue 节点上挂 vfor 字段（vue-eslint-parser AST）
  if (parent.type === 'VElement' && parent.startTag && parent.startTag.attributes) {
    for (const a of parent.startTag.attributes) {
      if (a.directive && a.key && name.name === 'for') return true;
    }
  }
  return hasAncestorVFor(templateAst, parent, depth + 1);
}

function checkTemplate(templateAst, result) {
  if (!templateAst) return;
  // walk VElement
  (function visit(node) {
    if (!node) return;
    if (node.type === 'VElement') {
      // 是否本节点就是 v-for
      let selfIsVFor = false;
      if (node.startTag && node.startTag.attributes) {
        for (const a of node.startTag.attributes) {
          if (a.directive && a.key && a.key.name && a.key.name.name === 'for') {
            selfIsVFor = true;
            break;
          }
        }
      }
      if (selfIsVFor && hasAncestorVFor(templateAst, node)) {
        const line = node.loc?.start?.line;
        result.warnings.push(`V13: template 第 ${line || '?'} 行 v-for 嵌套 v-for（ACT Cube 不允许）`);
      }
      for (const c of node.children || []) visit(c);
    } else if (node.children) {
      for (const c of node.children) visit(c);
    }
  })(templateAst);
}

function checkStructElements(elements, result) {
  // 产物里的 vfor 描述符：用 nid 父子关系做层级判断
  if (!elements || elements.length === 0) return;
  // 把 elements 转为 nid → element 映射；VElement 在 json 形态下没有 parent，
  // 退而求其次：检测同一 struct 子树里有多个 vfor
  // 更稳：递归遍历 struct，检测嵌套
  const stack = [];
  (function visit(el) {
    if (!el) return;
    if (el.vfor) stack.push(el);
    for (const c of el.children || []) visit(c);
    if (el.vfor) stack.pop();
    // 如果当前节点是 v-for 且栈深度 > 1（外层还有），报
    // 这里靠调用前的 stack 长度判断
  })({ children: elements });

  // 递归检查（带深度）
  function deep(els, depth) {
    for (const el of els || []) {
      if (el.vfor && depth >= 1) {
        result.warnings.push(`V13: struct nid=${el.nid} v-for 嵌套（ACT Cube 不允许）`);
      }
      deep(el.children || [], el.vfor ? depth + 1 : depth);
    }
  }
  deep(elements, 0);
}

function check(ctx, result) {
  checkTemplate(ctx.templateAst, result);
  // struct 入口只对 ctx.json.struct.elements 感兴趣；当前 ctx 暂未存，
  // 留作 hook：调用方可在 buildContext 里给 ctx.elements 加 struct 形态
  checkStructElements(ctx.elements, result);
}

module.exports = { check, checkTemplate, checkStructElements };