/**
 * V19: 交易流程序列图 + 串行调用校验
 *
 * 检测：
 *   - 在 method 函数体内调用 mpaasApi.rpc(...) 视为一次"远程接口调用"
 *   - 同一方法体内出现 >= 2 次 rpc 调用时，必须是 await 串行调用
 *   - 用 mermaid 序列图语法渲染出方法调用链 + 写到 ctx.flowMermaid
 *
 * 严重度：
 *   - 并行调用 → warning（违反 ACT 交易流程规范）
 *   - 流程图生成 → info（写到 ctx.flowMermaid 供后续报告用）
 */

const estraverse = require('estraverse');

const RPC_METHOD = /rpc/i;

// espree / estraverse 默认遍历的字段集合。
// 关键：vue-eslint-parser 会在 VElement 节点上挂 `startTag`/`endTag`/`parent`/`namespace`/`tokens`/`comments` 等非 AST 字段，
// 这些字段若被递归遍历，会形成 parent → root → parent 的环导致栈溢出。
// 因此显式声明只走 ESTree 节点字段，并禁用 fallback，避免把 Vue 元数据当 AST 节点遍历。
const SAFE_KEYS = Object.create(null);
[
  // Expression / Pattern
  'expression', 'left', 'right', 'test', 'alternate', 'consequent',
  'object', 'property', 'arguments', 'callee', 'elements', 'argument',
  'tag', 'value', 'name', 'computed', 'shorthand',
  // Statement / Block
  'body', 'block', 'handler', 'handlers', 'finalizer',
  'init', 'update', 'declarations', 'declaration',
  // Function
  'params', 'async', 'generator',
  // Class / Property
  'superClass', 'super', 'key', 'kind',
  // Program
  'sourceType', 'innerComments', 'outerComments', 'leadingComments', 'trailingComments',
].forEach((k) => { SAFE_KEYS[k] = true; });

/**
 * 给 AST 节点手动挂 parent 字段（espree 默认不带）。
 * 只走 SAFE_KEYS，避免遍历 Vue 节点上的元数据字段触发引用环。
 */
function attachParents(root) {
  if (!root || typeof root !== 'object') return;
  const stack = [{ node: root, parent: null }];
  while (stack.length) {
    const { node, parent } = stack.pop();
    if (parent) node.__p = parent;
    for (const k of Object.keys(node)) {
      if (!SAFE_KEYS[k]) continue;
      const v = node[k];
      if (Array.isArray(v)) {
        for (const c of v) {
          if (c && typeof c === 'object' && c.type) stack.push({ node: c, parent: node });
        }
      } else if (v && typeof v === 'object' && v.type) {
        stack.push({ node: v, parent: node });
      }
    }
  }
}

function isRpcCall(node) {
  if (node.type !== 'CallExpression') return false;
  const c = node.callee;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
    if (!RPC_METHOD.test(c.property.name)) return false;
    const obj = c.object;
    return obj && obj.type === 'Identifier' && /^mpaas/i.test(obj.name);
  }
  return false;
}

function isAwaitedCall(callNode) {
  let p = callNode.__p;
  while (p) {
    if (p.type === 'AwaitExpression') return true;
    if (p.type === 'BlockStatement' || p.type === 'Program') return false;
    p = p.__p;
  }
  return false;
}

function collectRpcSequence(fnAst) {
  const seq = [];
  if (!fnAst.body || !fnAst.body.body) return seq;
  // 给函数体挂 parent（只走 ESTree 字段，跳过 Vue 元数据，防成环）
  attachParents(fnAst.body);
  estraverse.traverse(fnAst.body, {
    keys: SAFE_KEYS,
    enter(node) {
      if (isRpcCall(node)) {
        seq.push({
          methodName: node.callee.property.name,
          line: node.loc?.start?.line,
          awaited: isAwaitedCall(node),
        });
      }
    },
  });
  return seq;
}

function buildMermaid(seq, methodName) {
  if (!seq || seq.length === 0) return null;
  const lines = [`sequenceDiagram`, `   autonumber`];
  lines.push(`  participant Card as ${methodName}`);
  seq.forEach((s, i) => {
    const step = i + 1;
    lines.push(`  Card->>mpaas: ${step}. ${s.methodName}()  ${s.awaited ? '(await)' : ''}`);
  });
  return lines.join('\n');
}

function check(ctx, result) {
  if (!ctx.classified) return;

  // 收集所有可被检测的函数（methods 块 + lifecycle 块）
  const buckets = [];
  if (ctx.classified.methods && ctx.classified.methods.type === 'ObjectExpression') {
    buckets.push(...ctx.classified.methods.properties);
  }
  if (Array.isArray(ctx.classified.lifecycle)) {
    for (const item of ctx.classified.lifecycle) {
      // lifecycle 形态: { key, node: Property }
      if (item.node && item.node.type === 'Property') buckets.push(item.node);
    }
  }

  for (const prop of buckets) {
    if (prop.type !== 'Property') continue;
    const name = prop.key.name || prop.key.value;
    const fn = prop.value;
    if (!fn || (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression')) continue;

    const seq = collectRpcSequence(fn);
    if (seq.length === 0) continue;

    // 串行检查：>= 2 次 rpc 调用应都 await
    const notAwaited = seq.filter((s) => !s.awaited);
    if (seq.length >= 2 && notAwaited.length > 0) {
      const lines = notAwaited.map((s) => `${s.methodName}@${s.line || '?'}`).join(', ');
      result.warnings.push(`V19: method "${name}" 出现 ${seq.length} 次 RPC 调用，其中非 await：${lines}（ACT 交易流程要求串行）`);
    }

    // 生成 mermaid 序列图（写到 ctx.flowMermaid[name]）
    if (!ctx.flowMermaid) ctx.flowMermaid = {};
    const md = buildMermaid(seq, name);
    if (md) {
      ctx.flowMermaid[name] = md;
      result.info.push(`V19: method "${name}" 含 ${seq.length} 次 RPC，序列图已生成（ctx.flowMermaid.${name}）`);
    }
  }
}

module.exports = { check, collectRpcSequence, buildMermaid };