/**
 * common/date：日期工具（V20 白名单子模块）
 */
const date = {
  // 格式化时间戳，默认 YYYY-MM-DD HH:mm
  fmt(ts, pattern) {
    const p = pattern || 'YYYY-MM-DD HH:mm';
    const d = new Date(typeof ts === 'number' ? ts : Date.now());
    if (isNaN(d.getTime())) return '';
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return p
      .replace('YYYY', '' + d.getFullYear())
      .replace('MM', pad(d.getMonth() + 1))
      .replace('DD', pad(d.getDate()))
      .replace('HH', pad(d.getHours()))
      .replace('mm', pad(d.getMinutes()))
      .replace('ss', pad(d.getSeconds()));
  },
  // 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期
  relative(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + ' 天前';
    return this.fmt(ts, 'YYYY-MM-DD');
  },
};

export default date;