/**
 * V20: common 公共方法引用校验
 *
 * ACT 卡片通过 `require('./common/xxx')` 或 `require('../common/xxx')` 引用
 * 项目里 `common/` 文件夹下的公共 js。注意：
 *   - 没有 `@common/` 这种 @ 前缀形式（那是 npm 包 namespace）
 *   - 路径是相对当前 .vue 同级 / 上级的相对路径
 *
 * 检测：
 *   1) import/require(...) 的字符串参数如果是相对路径且指向 common 文件夹，校验是否在 allowedNames 白名单
 *   2) 禁止使用 `@common/`、`@libs/` 等 @ 前缀形式
 *   3) 同一 script 出现多种 common 模块 → 提示
 *
 * options（JSON 配置）：
 *   - allowedNames: 字符串数组，允许引用的 common 子模块名（默认 toast / format / date / validator）
 *   - replaceDefaults: boolean
 *   - maxImports: number
 *   - baseName: string，common 文件夹的根名（默认 "common"）
 *
 * 严重度：
 *   - 引用未在白名单 → error
 *   - 使用 @ 前缀 → error
 *   - 多种 common → info
 */

const estraverse = require('estraverse');

const DEFAULT_COMMON_ALLOWED = [
  'toast', 'format', 'date', 'validator', 'util',
];

function getAllowedNames(ctx) {
  const opts = ctx._ruleOptions || {};
  const base = opts.replaceDefaults ? [] : DEFAULT_COMMON_ALLOWED.slice();
  const extra = Array.isArray(opts.allowedNames) ? opts.allowedNames : [];
  return new Set([...base, ...extra]);
}

function check(ctx, result) {
  if (!ctx.scriptAst) return;
  const opts = ctx._ruleOptions || {};
  const allowed = getAllowedNames(ctx);
  const maxImports = (typeof opts.maxImports === 'number') ? opts.maxImports : Infinity;
  const baseName = opts.baseName || 'common';

  // 匹配相对路径引用了 baseName 文件夹：./common/x、../common/x、../../common/x、./common/sub/x
  const relCommonRe = new RegExp(`(?:^|/)\\.\\.?/(?:.*/)?${baseName}/([\\w./_-]+)`);

  const calls = []; // { name, raw, line }

  // 统一处理一条"字符串路径引用"：校验 @ 前缀 + common 白名单
  // import ... from '...' 与 require('...') 共用此逻辑
  function examine(raw, line) {
    // 1) 禁止 @ 前缀（npm namespace，卡片不该用）
    if (/^@/.test(raw)) {
      result.errors.push(`V20: script 第 ${line || '?'} 行引用 '${raw}' 用了 @ 前缀（npm namespace），卡片不应使用，请改用相对路径引用 ${baseName}/`);
      return;
    }

    // 2) 检测是否引用 common 文件夹
    const m = raw.match(relCommonRe);
    if (!m) return;

    const subPath = m[1]; // 比如 'format' 或 'utils/format'
    const subModule = subPath.split('/')[0]; // 取第一段作为白名单 key
    calls.push({ name: subModule, raw, line });

    if (!allowed.has(subModule)) {
      result.errors.push(`V20: script 第 ${line || '?'} 行引用 '${raw}'，其中 ${baseName}/${subModule} 不在白名单（allowed: ${[...allowed].join(', ')}）`);
    }
  }

  estraverse.traverse(ctx.scriptAst, {
    enter(node) {
      // require('...') 形式
      if (node.type === 'CallExpression') {
        const c = node.callee;
        if (c.type === 'Identifier' && c.name === 'require') {
          const arg = node.arguments[0];
          const line = node.loc?.start?.line;
          if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
            examine(arg.value, line);
          }
        }
        return;
      }
      // import ... from '...' 形式
      if (node.type === 'ImportDeclaration') {
        const src = node.source;
        const line = node.loc?.start?.line;
        if (src && src.type === 'Literal' && typeof src.value === 'string') {
          examine(src.value, line);
        }
      }
    },
  });

  if (calls.length > maxImports) {
    result.warnings.push(`V20: script 内 common 模块引用 ${calls.length} 次，超过 maxImports=${maxImports}`);
  }

  const uniqueNames = new Set(calls.map((c) => c.name));
  if (uniqueNames.size >= 2) {
    result.info.push(`V20: script 引用了多个 ${baseName} 模块（${[...uniqueNames].join(', ')}），请确认分模块设计合理`);
  }
}

module.exports = { check, DEFAULT_COMMON_ALLOWED, getAllowedNames };