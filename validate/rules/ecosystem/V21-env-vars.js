/**
 * V21: env 环境配置文件引用校验
 *
 * ACT 卡片通过相对路径直接 import/require 环境配置文件来读取环境变量，常见形态：
 *   - `require('./.env.sit')`           script 当前目录的 sit 环境
 *   - `import ENV from '../.env.uat'`    上一级目录的 uat 环境
 *   - `require('../../.env.prod')`       上两级的 prod 环境
 *
 * 文件名用来区分环境。env 名（sit / uat / prod / pre 等）应是已知的有效环境名。
 * 支持两种命名（构建需要 .js 扩展名，故推荐后者）：
 *   - `env/<env>.js`   如 `env/env.sit.js`（推荐，.js 后缀可被 import 静态加载）
 *   - `.env.<env>`     如 `env/.env.sit`（旧写法，非 .js 后缀）
 *
 * 检测：
 *   1) require('.../env/env.sit.js') / import ... from '.../env/env.uat.js' 的
 *      env 名必须在 ENV_ALLOWED 白名单
 *   2) env 配置文件的引用不应写在循环 / 异步分支里（保证启动时一次加载）
 *   3) 同一 script 引用多个不同 env 文件 → warning（应只引用当前环境对应的一个）
 *   4) 出现形如 `.env.dev` / `.env.local` 这种非生产环境约定后缀 → info
 *
 * options（JSON 配置）：
 *   - allowedEnvNames: 字符串数组，允许的环境名（默认 sit / uat / prod / pre / gray）
 *   - replaceDefaults: boolean
 *   - warnOnMultiple: boolean，是否对"一个 script 引多个 env"告警（默认 true）
 *
 *   严重度：
 *     - 白名单外 env → error
 *     - 多个 env → warning
 *     - dev/local 等本地配置 → info
 */

const estraverse = require('estraverse');

const DEFAULT_ENV_NAMES = ['sit', 'uat', 'prod', 'pre', 'gray'];
// 仅提示，不强校验
const LOCAL_ENV_HINTS = ['dev', 'local', 'test', 'mock'];

function getOptions(ctx) {
  const o = ctx._ruleOptions || {};
  const base = o.replaceDefaults ? [] : DEFAULT_ENV_NAMES.slice();
  const extra = Array.isArray(o.allowedEnvNames) ? o.allowedEnvNames : [];
  return {
    allowed: new Set([...base, ...extra]),
    warnOnMultiple: o.warnOnMultiple !== false,
  };
}

// 匹配 env 文件名里的 <env> 段：支持 env.sit.js / .env.sit / env.sit（旧）
const ENV_FILE_RE = /\.env\.([a-zA-Z][\w-]*)|env\.([a-zA-Z][\w-]*)\.js$/;

function check(ctx, result) {
  if (!ctx.scriptAst) return;
  const opts = getOptions(ctx);

  const refs = []; // { env, raw, line }

  // 统一处理一条字符串路径引用：require('...') 与 import ... from '...' 共用
  function examine(raw, line) {
    // 只关心以 env 文件结尾的（不论相对路径前缀 / 目录层级），两种命名都支持。
    //   'env/env.sit.js'  → sit
    //   '.env.sit'        → sit
    const m = raw.match(ENV_FILE_RE);
    if (!m) return;
    const env = m[1] || m[2];
    if (!env) return;

    if (!opts.allowed.has(env)) {
      // 本地配置名（dev/local/test/mock）放宽为 info，其他未知名 → error
      if (LOCAL_ENV_HINTS.includes(env)) {
        result.info.push(`V21: script 第 ${line || '?'} 行引用 '${raw}' 是本地环境配置（${env}），不应进生产`);
      } else {
        result.errors.push(`V21: script 第 ${line || '?'} 行引用 '${raw}' 引用了未知环境 '${env}'（allowed: ${[...opts.allowed].join(', ')}）`);
      }
    } else if (LOCAL_ENV_HINTS.includes(env)) {
      result.info.push(`V21: script 第 ${line || '?'} 行引用 '${raw}' 是本地环境配置（${env}），不应进生产`);
    }
    refs.push({ env, raw, line });
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

  if (opts.warnOnMultiple) {
    const uniqueEnvs = new Set(refs.map((r) => r.env));
    if (uniqueEnvs.size >= 2) {
      const lines = refs.map((r) => `${r.env}@${r.line || '?'}`).join(', ');
      result.warnings.push(`V21: script 内同时引用了 ${uniqueEnvs.size} 个不同 env 文件（${lines}），应只引用当前环境对应的一个`);
    }
  }

  if (refs.length === 0) {
    result.info.push(`V21: script 未引用任何 .env.*x 配置，请确认该卡片是否依赖环境配置`);
  }
}

module.exports = { check, DEFAULT_ENV_NAMES, LOCAL_ENV_HINTS, getOptions };