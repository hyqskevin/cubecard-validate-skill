/**
 * V8: 生命周期白名单
 *
 * 实现：直接读 ctx.classified.lifecycle（来自 _context.js 对 export default
 * 顶层属性的分类）。不在白名单的报 warning。
 *
 * options（JSON 配置）：
 *   - allowedLifecycle: 字符串数组，额外追加的白名单生命周期
 *   - replaceDefaults: boolean，是否替换默认白名单（默认 false = 追加）
 */

const DEFAULT_LIFECYCLE = [
  'data', 'methods',
  'beforeCreate', 'created', 'beforeMount', 'mounted',
  'beforeUpdate', 'updated',
  'didAppear', 'didDisappear', 'didMount',
];

function getAllowed(ctx) {
  const opts = ctx._ruleOptions || {};
  const base = opts.replaceDefaults ? [] : DEFAULT_LIFECYCLE.slice();
  const extra = Array.isArray(opts.allowedLifecycle) ? opts.allowedLifecycle : [];
  return new Set([...base, ...extra]);
}

function check(ctx, result) {
  if (!ctx.classified) return;
  const allowed = getAllowed(ctx);
  for (const { key } of ctx.classified.lifecycle) {
    if (!allowed.has(key)) {
      result.warnings.push(`V8: 未知生命周期 "${key}"（ACT 不支持将忽略）`);
    }
  }
}

module.exports = { check, DEFAULT_LIFECYCLE, getAllowed };
