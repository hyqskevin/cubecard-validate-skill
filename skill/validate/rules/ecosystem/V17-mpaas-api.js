/**
 * V17: mpaas 客户端 API 调用合法性
 *
 * ACT 卡片用 `const mpaasApi = requireModule('mpaas_jsapi')` 引入客户端 API，
 * 再通过 mpaasApi.xxx(...) 调用具体能力（rpc / storage / push / etc）。
 *
 * 检测形态：
：
 *   1) requireModule(...) 的字符串参数必须是 'mpaas_jsapi'（唯一允许的 module 名）
 *   2) requireModule 调用必须有左值接收（const/let/var），不允许丢弃返回值
 *   3) mpaasApi 的方法调用应只调 ACT 文档列出的白名单 API 名（不全校验，给警告）
 *   4) 同一函数体内连续出现两次以上 requireModule 应提示合并
 */

const estraverse = require('estraverse');

const MPAAS_MODULE_NAME = 'mpaas_jsapi';

// ACT 客户端 API 已知白名单（不全，仅做基础校验）
const DEFAULT_API_WHITELIST = [
  'rpc', 'storage', 'push', 'session', 'device', 'location', 'pay', 'scan', 'share',
  'navigate', 'setTitle', 'alert', 'confirm', 'showToast', 'getNetworkType',
];

function getApiWhitelist(ctx) {
  const opts = ctx._ruleOptions || {};
  const base = opts.replaceDefaults ? [] : DEFAULT_API_WHITELIST.slice();
  const extra = Array.isArray(opts.apiWhitelist) ? opts.apiWhitelist : [];
  return new Set([...base, ...extra]);
}

function check(ctx, result) {
  if (!ctx.scriptAst) return;
  let reqCount = 0;
  const apiWhitelist = getApiWhitelist(ctx);

  estraverse.traverse(ctx.scriptAst, {
    enter(node, parent) {
      // requireModule(...) 调用形态
      if (node.type === 'CallExpression'
          && node.callee.type === 'Identifier'
          && node.callee.name === 'requireModule') {
        reqCount++;
        const arg = node.arguments[0];
        const line = node.loc?.start?.line;
        if (!arg || arg.type !== 'Literal' || arg.value !== MPAAS_MODULE_NAME) {
          result.errors.push(`V17: script 第 ${line || '?'} 行 requireModule(...) 参数必须是 '${MPAAS_MODULE_NAME}' 字面量`);
          return;
        }
        // 检查 parent 是否是 VariableDeclarator（要求赋给变量）
        if (!(parent && parent.type === 'VariableDeclarator' && parent.init === node)) {
          result.warnings.push(`V17: script 第 ${line || '?'} 行 requireModule(...) 必须赋值给 const/let/var，不应丢弃`);
        }
      }

      // mpaasApi.xxx(...) 调用
      if (node.type === 'CallExpression'
          && node.callee.type === 'MemberExpression'
          && !node.callee.computed
          && node.callee.object.type === 'Identifier'
          && /^mpaas/i.test(node.callee.object.name)) {
        const method = node.callee.property.name;
        const line = node.loc?.start?.line;
        if (apiWhitelist.size > 0 && !apiWhitelist.has(method)) {
          result.info.push(`V17: script 第 ${line || '?'} 行 mpaasApi.${method}(...) 不在已知白名单（需对照 ACT 文档确认）`);
        }
      }
    },
  });

  if (reqCount > 1) {
    result.warnings.push(`V17: script 内 requireModule(...) 出现 ${reqCount} 次，建议合并为单个 const`);
  }
}

module.exports = { check, MPAAS_MODULE_NAME, DEFAULT_API_WHITELIST, getApiWhitelist };