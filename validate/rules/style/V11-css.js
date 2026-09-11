/**
 * V11: <style> 段 CSS 词法校验
 *
 * 实现：用 css-tree 2.x 解 <style> 段（cube-ext-css-tree 同款），逐
 * 个 Declaration 节点检查 ACT DSL 的 CSS 受限项：
 *
 *   - ACT 只支持 px / rpx；其它单位（em/rem/vh/vw/%）→ warning
 *   - background-image 的 url() 必须 https:// → warning
 *   - 不允许 z-index / position:fixed / overflow:scroll → warning
 *     （这些在小程序/DSL 端常被丢弃或不一致）
 *   - 选择器里出现 ACT 不支持的伪类（:hover / :focus）→ info
 *     （ACT DSL 只 :active 可用，其它 hover/focus 在原生无对应）
 *
 * 注意：styleContent 取自 ctx.vueContent 的 <style>...</style> 切片。
 */

const csstree = require('css-tree');

const ALLOWED_UNITS = new Set(['px', 'rpx']);
const FORBIDDEN_PROPS = new Set(['z-index']);
const FIXED_VALUE_PROPS = new Set(['position']);
const FIXED_FORBIDDEN_VALUES = new Set(['fixed', 'absolute']);
const SCROLL_FORBIDDEN_PROPS = new Set(['overflow', 'overflow-x', 'overflow-y']);
const SCROLL_FORBIDDEN_VALUES = new Set(['scroll', 'auto']);
const UNSUPPORTED_PSEUDOS = new Set(['hover', 'focus', 'visited', 'link']);

/**
 * 从 vueContent 抽出 <style>...</style> 的 CSS 文本。
 */
function extractStyleText(vueContent) {
  const m = vueContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

/**
 * 把节点上收集到的"声明"列表生成出来，附带 line 号便于排错。
 * baseLine 是 <style> 起始行（main.vue 中的绝对行号）；css-tree
 * 报的 line 是 CSS 片段内部行号，要加上 baseLine - 1 才得到 main.vue
 * 里的绝对行号。
 */
function walkDeclarations(ast, visit, baseLine = 0) {
  csstree.walk(ast, (node) => {
    if (node.type !== 'Declaration') return;
    const prop = node.property.toLowerCase();
    const valueText = csstree.generate(node.value);
    const line = (node.loc && node.loc.start && node.loc.start.line || 1) + baseLine;
    visit(prop, valueText, node, line);
  });
}

/**
 * 从 value 文本里抽出所有 Number + Dimension/Percentage/Length 节点，
 * 检查单位是否在白名单。
 */
function collectUnits(ast, prop, declNode, visit, baseLine = 0) {
  csstree.walk(declNode.value, (n) => {
    if (n.type !== 'Dimension' && n.type !== 'Percentage') return;
    const unit = n.unit || (n.type === 'Percentage' ? '%' : '');
    const line = (n.loc && n.loc.start && n.loc.start.line || 1) + baseLine;
    visit(unit, line);
  });
}

/**
 * 选择器里扫描伪类名。
 */
function collectPseudos(selectorNode, visit, baseLine = 0) {
  csstree.walk(selectorNode, (n) => {
    if (n.type !== 'PseudoClassSelector' && n.type !== 'PseudoElementSelector') return;
    const name = n.name && n.name.toLowerCase();
    const line = (n.loc && n.loc.start && n.loc.start.line || 1) + baseLine;
    visit(name, line);
  });
}

function check(ctx, result) {
  // <style> 在 main.vue 里的起始行号（来自 _context.js 正则扫的）
  const baseLine = (ctx.blockLines && ctx.blockLines.style || 1) - 1;

  const css = extractStyleText(ctx.vueContent);
  if (!css.trim()) return;

  let ast;
  try {
    ast = csstree.parse(css, { positions: true });
  } catch (e) {
    result.warnings.push(`V11: <style> CSS 解析失败（第 ${baseLine + 1} 行附近）: ${e.message}`);
    return;
  }

  // 统计长度单位使用情况，用于"建议优先使用 rpx"
  let lengthUnits = 0;
  let rpxCount = 0;

  walkDeclarations(ast, (prop, valueText, declNode, line) => {
    // 1) 禁用属性
    if (FORBIDDEN_PROPS.has(prop)) {
      result.warnings.push(`V11: <style> 第 ${line} 行 "${prop}: ${valueText}" 不在 ACT CSS 白名单`);
      return;
    }
    // 2) position: fixed/absolute
    if (FIXED_VALUE_PROPS.has(prop) && FIXED_FORBIDDEN_VALUES.has(valueText.trim())) {
      result.warnings.push(`V11: <style> 第 ${line} 行 "${prop}: ${valueText}" 在 ACT 引擎被忽略`);
      return;
    }
    // 3) overflow: scroll/auto
    if (SCROLL_FORBIDDEN_PROPS.has(prop) && SCROLL_FORBIDDEN_VALUES.has(valueText.trim())) {
      result.warnings.push(`V11: <style> 第 ${line} 行 "${prop}: ${valueText}" 在 ACT 引擎无滚动条`);
      return;
    }
    // 4) url() 必须 https://
    csstree.walk(declNode.value, (n) => {
      if (n.type !== 'Url') return;
      let url;
      if (typeof n.value === 'string') {
        url = n.value;
      } else if (n.value && typeof n.value === 'object') {
        url = n.value.value || (n.value.children && n.value.children.toArray().map((c) => c.value).join(''));
      }
      if (typeof url === 'string' && url.length && !/^https:\/\//.test(url)) {
        const urlLine = (n.loc && n.loc.start && n.loc.start.line || 1) + baseLine;
        result.warnings.push(`V11: <style> 第 ${urlLine} 行 url("${url}") 非 https://，小程序可能拒载`);
      }
    });
    // 5) 单位白名单 + 统计
    collectUnits(ast, prop, declNode, (unit, unitLine) => {
      if (unit) {
        lengthUnits++;                    // 出现任一长度单位
        if (unit === 'rpx') rpxCount++;   // 其中 rpx 的次数
      }
      if (unit && !ALLOWED_UNITS.has(unit)) {
        result.warnings.push(`V11: <style> 第 ${unitLine} 行单位 "${unit}" 不在 ACT 白名单（仅支持 px / rpx）`);
      }
    }, baseLine);
  }, baseLine);

  // 6) 选择器伪类白名单
  csstree.walk(ast, (node) => {
    if (node.type !== 'Rule') return;
    csstree.walk(node.prelude, (selectorNode) => {
      if (selectorNode.type !== 'Selector') return;
      collectPseudos(selectorNode, (name, line) => {
        if (UNSUPPORTED_PSEUDOS.has(name)) {
          result.info.push(`V11: <style> 第 ${line} 行伪类 :${name} 在 ACT 引擎可能不生效`);
        }
      }, baseLine);
    });
  });

  // 7) 建议优先使用 rpx（整卡 style 出现长度单位但一处 rpx 都没有时提示）
  if (lengthUnits > 0 && rpxCount === 0) {
    result.info.push('V11: 本卡 <style> 未使用 rpx 单位，ACT 建议优先使用 rpx（当前仅 px）以保证各端缩放一致');
  }
}

module.exports = {
  check,
  extractStyleText,
  ALLOWED_UNITS,
  FORBIDDEN_PROPS,
  FIXED_VALUE_PROPS,
  SCROLL_FORBIDDEN_PROPS,
  UNSUPPORTED_PSEUDOS,
};