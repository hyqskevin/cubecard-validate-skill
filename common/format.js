/**
 * common/format：通用格式化（V20 白名单子模块）
 * 交易场景常用：金额（分→元）、手机号脱敏、银行卡脱敏、订单号补零。
 */
const format = {
  // 金额，入参单位是"分"，输出 ¥xx.xx
  money(cents) {
    if (typeof cents !== 'number' || isNaN(cents)) return '¥0.00';
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    const yuan = Math.floor(abs / 100);
    const fen = abs % 100;
    const fenStr = fen < 10 ? '0' + fen : '' + fen;
    return sign + '¥' + yuan + '.' + fenStr;
  },
  // 手机号脱敏：138****1234
  phone(raw) {
    if (typeof raw !== 'string') return '';
    const s = raw.replace(/\D/g, '');
    if (s.length !== 11) return raw;
    return s.slice(0, 3) + '****' + s.slice(7);
  },
  // 银行卡脱敏：6222 **** **** 8888
  bankCard(raw) {
    if (typeof raw !== 'string') return '';
    const s = raw.replace(/\s/g, '');
    if (s.length < 8) return s;
    return s.slice(0, 4) + ' **** **** ' + s.slice(-4);
  },
  // 订单号补零：长订单号也要显示全，这里只做居中隐藏
  orderNo(raw) {
    if (typeof raw !== 'string') return '';
    const s = raw.replace(/\D/g, '');
    if (s.length <= 8) return s;
    return s.slice(0, 4) + ' **** ' + s.slice(-4);
  },
};

export default format;