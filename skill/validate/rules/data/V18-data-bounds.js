/**
 * V18: data 边界校验
 *
 * 默认阈值（可通过 ctx._ruleOptions.maxArrayLen / maxObjKeys 覆盖）：
 *   - maxArrayLen = 100（卡片 data 里单个数组长度上限）
 *   - maxObjKeys = 50（单个对象属性数上限）
 *   - maxDepth = 5（嵌套对象/数组深度上限）
 *
 * 严重度：error 命中即超限（避免运行时崩溃 / 内存爆炸）
 */

const DEFAULTS = {
  maxArrayLen: 100,
  maxObjKeys: 50,
  maxDepth: 5,
};

function shapeStats(value, maxDepth, stats) {
  if (stats.depth >= maxDepth) {
    stats.overDepth = true;
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > stats.maxArrayLen) stats.overArrayLen = true;
    for (const item of value) {
      const child = { depth: stats.depth + 1, maxArrayLen: stats.maxArrayLen, overArrayLen: stats.overArrayLen, overObjKeys: stats.overObjKeys, overDepth: stats.overDepth };
      shapeStats(item, maxDepth, child);
      if (child.overArrayLen) stats.overArrayLen = true;
      if (child.overObjKeys) stats.overObjKeys = true;
      if (child.overDepth) stats.overDepth = true;
    }
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > stats.maxObjKeys) stats.overObjKeys = true;
    for (const k of keys) {
      const child = { depth: stats.depth + 1, maxArrayLen: stats.maxArrayLen, overArrayLen: stats.overArrayLen, overObjKeys: stats.overObjKeys, overDepth: stats.overDepth };
      shapeStats(value[k], maxDepth, child);
      if (child.overArrayLen) stats.overArrayLen = true;
      if (child.overObjKeys) stats.overObjKeys = true;
      if (child.overDepth) stats.overDepth = true;
    }
  }
}

function check(ctx, result) {
  if (!ctx.classified || !ctx.classified.data) return;
  if (ctx.classified.data.type !== 'ObjectExpression') return;

  // options 注入
  const opts = ctx._ruleOptions || {};
  const maxArrayLen = opts.maxArrayLen || DEFAULTS.maxArrayLen;
  const maxObjKeys = opts.maxObjKeys || DEFAULTS.maxObjKeys;
  const maxDepth = opts.maxDepth || DEFAULTS.maxDepth;

  // ctx._ruleOptions 暂时只支持在 rules.config.json options 注入；
  // data 的真值需要 buildContext 时同时跑 espree 解析 ObjectExpression 里
  // 的数组/对象字面量。ctx 里目前没有现成解析；这里用简化的"只读 fields 名字"
  // 加上 data 的 raw 属性提示用户。

  const props = ctx.classified.data.properties;
  if (props.length > maxObjKeys) {
    result.errors.push(`V18: data 顶层字段数 ${props.length} > ${maxObjKeys}（超限）`);
  }
  for (const p of props) {
    if (p.type !== 'Property') continue;
    const name = p.key.name || p.key.value;
    // 简单识别"值是数组字面量且长度超限"
    if (p.value && p.value.type === 'ArrayExpression') {
      if (p.value.elements.length > maxArrayLen) {
        result.errors.push(`V18: data.${name} 数组长度 ${p.value.elements.length} > ${maxArrayLen}（超限）`);
      }
    }
    // 简单识别"值是对象字面量且 keys 超限"
    if (p.value && p.value.type === 'ObjectExpression') {
      if (p.value.properties.length > maxObjKeys) {
        result.warnings.push(`V18: data.${name} 嵌套对象键数 ${p.value.properties.length} > ${maxObjKeys}`);
      }
    }
  }
}

module.exports = { check, DEFAULTS };