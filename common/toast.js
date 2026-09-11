/**
 * common/toast：轻量提示（V20 白名单子模块）
 */
const toast = {
  show(msg) {
    if (typeof msg !== 'string') return;
    return { type: 'toast', message: msg, at: Date.now() };
  },
  error(msg) {
    return { type: 'toast', level: 'error', message: msg, at: Date.now() };
  },
};

export default toast;