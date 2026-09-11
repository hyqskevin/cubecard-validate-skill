/**
 * 规则注册表加载器
 *
 * 把 validate/rules.config.json 里声明的规则读出来，做：
 *   1) JSON Schema 校验（validate/rules.config.schema.json）
 *   2) 模块路径解析（相对 skill/ 根）
 *   3) require() 加载模块；模块必须 export `check(ctx, result, cardName)`
 *   4) 按 severity 分类（error/warning/info），返回给 validate/index.js
 *
 * 路径：
 *   - rules.config.json / rules.config.schema.json 在 validate/ 下（数据）
 *   - 本文件（rules-loader.js）在 config/ 下（脚本）
 *
 * 缓存：模块加载后缓存在 moduleCache，避免重复 require。
 */

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const SKILL_ROOT = path.resolve(__dirname, '..');
const VALIDATE_DIR = path.join(SKILL_ROOT, 'validate');
const RULES_CONFIG = path.join(VALIDATE_DIR, 'rules.config.json');
const RULES_SCHEMA = path.join(VALIDATE_DIR, 'rules.config.schema.json');

let cachedRules = null;
const moduleCache = new Map();

function _validateConfig() {
  if (!fs.existsSync(RULES_CONFIG)) {
    throw new Error(`rules.config.json 不存在：${RULES_CONFIG}`);
  }
  const raw = JSON.parse(fs.readFileSync(RULES_CONFIG, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(RULES_SCHEMA, 'utf8'));
  const aj = new Ajv({ allErrors: true, strict: false });
  const validate = aj.compile(schema);
  if (!validate(raw)) {
    const errs = (validate.errors || []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`rules.config.json 校验失败: ${errs}`);
  }
  return raw;
}

/**
 * 解析模块路径：相对 skill/ 根，require() 加载。
 * 缓存到 moduleCache。
 */
function _loadModule(modPath) {
  if (moduleCache.has(modPath)) return moduleCache.get(modPath);
  const abs = path.isAbsolute(modPath) ? modPath : path.resolve(SKILL_ROOT, modPath);
  const mod = require(abs);
  moduleCache.set(modPath, mod);
  return mod;
}

/**
 * 读取所有启用的规则。
 * @returns {Array<{id, severity, module, mod, description, options}>}
 */
function loadEnabledRules() {
  if (cachedRules) return cachedRules;
  const cfg = _validateConfig();
  const result = [];
  for (const def of cfg.rules) {
    if (def.enabled === false) continue;
    if (!['error', 'warning', 'info'].includes(def.severity)) {
      throw new Error(`规则 ${def.id} 的 severity "${def.severity}" 非法（必须 error/warning/info）`);
    }
    let mod;
    try {
      mod = _loadModule(def.module);
    } catch (e) {
      throw new Error(`规则 ${def.id} 模块 ${def.module} 加载失败: ${e.message}`);
    }
    if (typeof mod.check !== 'function') {
      throw new Error(`规则 ${def.id} 模块 ${def.module} 必须 export check(ctx, result, cardName)`);
    }
    result.push({
      id: def.id,
      severity: def.severity,
      module: def.module,
      mod,
      description: def.description || '',
      options: def.options || {},
    });
  }
  cachedRules = result;
  return result;
}

/**
 * 读取所有启用的 ESLint 规则。
 * @returns {Array<{id, severity, mod, description}>}
 */
function loadEnabledEslintRules() {
  const cfg = _validateConfig();
  const result = [];
  const eslint = cfg.eslint || { rules: [] };
  for (const def of eslint.rules) {
    if (def.enabled === false) continue;
    const mod = _loadModule(def.module);
    // eslint 规则定义在 mod.rules[id]
    // cube-eslint-plugin 里规则 keys 是短名（no-unknown-lifecycle），
    // 配置里写 cube/no-unknown-lifecycle 时要去掉前缀再查
    const shortId = def.id.includes('/') ? def.id.split('/').slice(-1)[0] : def.id;
    const ruleMod = mod.rules && (mod.rules[def.id] || mod.rules[shortId]);
    if (!ruleMod) {
      throw new Error(`ESLint 规则 ${def.id} 不在模块 ${def.module}.rules 里`);
    }
    result.push({
      id: def.id,
      severity: def.severity,
      mod: ruleMod,
      description: def.description || '',
    });
  }
  return result;
}

/**
 * 列出所有规则（含禁用的），给 cli --list-rules 用。
 */
function listAllRules() {
  const cfg = _validateConfig();
  return cfg.rules.map((d) => ({ ...d, enabled: d.enabled !== false }));
}

/**
 * 手动清缓存（测试用）。
 */
function clearCache() {
  cachedRules = null;
  moduleCache.clear();
}

module.exports = {
  loadEnabledRules,
  loadEnabledEslintRules,
  listAllRules,
  clearCache,
  RULES_CONFIG,
  RULES_SCHEMA,
};