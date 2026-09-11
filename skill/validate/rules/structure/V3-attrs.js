/**
 * V3: 属性白名单
 *
 * - 普通属性白名单（class / id / style / value / src / type / placeholder / ...）
 * - bind 表达式属性白名单（value / class / style / src / type / placeholder / ...）
 * - 事件白名单（click / tap / change / input / focus / blur / ...）
 *
 * options（JSON 配置）：
 *   - allowedAttrs / allowedBindKeys / allowedEvents: 字符串数组，额外追加
 *   - replaceDefaults: boolean，是否替换对应默认白名单（默认 false = 追加）
 */

const DEFAULT_ATTRS = [
  'class', 'id', 'style', 'value', 'src', 'type', 'placeholder',
  'name', 'disabled', 'readonly', 'maxlength',
  'href', 'mode', 'autofocus', 'rows', 'cols',
];

const DEFAULT_BIND_KEYS = [
  'value', 'class', 'style', 'src', 'type', 'placeholder',
  'disabled', 'readonly', 'name', 'id', 'href',
];

const DEFAULT_EVENTS = [
  'click', 'tap', 'change', 'input', 'focus', 'blur',
  'submit', 'scroll', 'load', 'error',
  'longpress', 'touchstart', 'touchend',
];

function _merge(defaultList, extraList, replace) {
  return new Set([...(replace ? [] : defaultList), ...(Array.isArray(extraList) ? extraList : [])]);
}

function check(ctx, result) {
  const opts = ctx._ruleOptions || {};
  const allowedAttrs = _merge(DEFAULT_ATTRS, opts.allowedAttrs, opts.replaceDefaults);
  const allowedBindKeys = _merge(DEFAULT_BIND_KEYS, opts.allowedBindKeys, opts.replaceDefaults);
  const allowedEvents = _merge(DEFAULT_EVENTS, opts.allowedEvents, opts.replaceDefaults);

  for (const el of ctx.elements) {
    for (const attr of el.attrs) {
      // bind 属性 :x / v-bind:x
      if (attr.prefix === ':' || attr.prefix === 'v-bind:') {
        if (!allowedBindKeys.has(attr.key)) {
          result.warnings.push(`V3: <${el.tag}> 的 ${attr.prefix}${attr.key} 不在常见 bind 属性白名单`);
        }
        continue;
      }
      // 事件 @x / v-on:x
      if (attr.prefix === '@' || attr.prefix === 'v-on:') {
        if (!allowedEvents.has(attr.key)) {
          result.warnings.push(`V3: 事件 ${attr.key} 不在白名单`);
        }
        continue;
      }
      // 其它 v- 指令不在 V3 这里管（V4/V6/V7/V8 各管一类）
      if (attr.prefix === 'v-') continue;
      // 普通属性
      if (attr.value !== true && !allowedAttrs.has(attr.key)) {
        result.info.push(`V3: <${el.tag}> 属性 ${attr.key} 可能在 ACT 引擎不被识别`);
      }
    }
  }
}

module.exports = { check, DEFAULT_ATTRS, DEFAULT_BIND_KEYS, DEFAULT_EVENTS };
