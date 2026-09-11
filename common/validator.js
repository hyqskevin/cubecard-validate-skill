/**
 * common/validator：校验工具（V20 白名单子模块）
 * 交易链路常用：手机号 / 金额 / 订单号。
 */
const validator = {
  isPhone(s) {
    return typeof s === 'string' && /^1[3-9]\d{9}$/.test(s);
  },
  // 金额（分）必须在 1 ~ 10 亿分（1 元 ~ 1 千万元）
  isAmount(n) {
    return typeof n === 'number' && isFinite(n) && n > 0 && n <= 1000000000;
  },
  // 订单号：18~32 位数字
  isOrderNo(s) {
    return typeof s === 'string' && /^\d{18,32}$/.test(s);
  },
};

export default validator;