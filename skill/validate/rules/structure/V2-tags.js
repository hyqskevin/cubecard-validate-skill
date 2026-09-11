/**
 * V2: 模板标签白名单
 *
 * 用 vue-eslint-parser 的 VElement.name 直接拿标签名，比之前的手写
 * quote-aware 字符流解析更准（自动跳过注释、CDATA、模板内嵌表达式）。
 *
 * options（JSON 配置）：
 *   - allowedTags: 字符串数组，额外追加的白名单标签
 *   - replaceDefaults: boolean，是否替换默认白名单（默认 false = 追加）
 */

const DEFAULT_ALLOWED = [
  'template', 'script', 'style',
  'div', 'text', 'image', 'input', 'scroll-view', 'list', 'cell',
  'a', 'span',
  'external-richtext', // mPaaS 富文本组件（蚂蚁动态卡片内置，渲染 HTML 富文本）
];

function getAllowedTags(ctx) {
  const opts = ctx._ruleOptions || {};
  const base = opts.replaceDefaults ? [] : DEFAULT_ALLOWED.slice();
  const extra = Array.isArray(opts.allowedTags) ? opts.allowedTags : [];
  return new Set([...base, ...extra]);
}

function check(ctx, result) {
  const allowed = getAllowedTags(ctx);
  for (const el of ctx.elements) {
    if (el.tag === 'template') continue;
    if (!allowed.has(el.tag)) {
      result.warnings.push(`V2: 标签 <${el.tag}> 不在白名单（已支持：${[...allowed].filter(t => t !== 'template').join(', ')}）`);
    }
  }
}

module.exports = { check, DEFAULT_ALLOWED, getAllowedTags };
