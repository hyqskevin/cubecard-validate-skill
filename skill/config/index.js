/**
 * skill 统一配置读取器
 *
 * 角色定位（与 skill/config.yaml 协同）：
 *   - config.yaml   = 数据层（cards 列表 / agent 参数）
 *   - config/config.schema.json = config.yaml 的统一 JSON Schema（cards + agent）
 *   - 本文件 (index.js) = 脚本层（路径解析、yaml 解析、统一 schema 校验）
 *
 * Skill 内部不再硬编码任何具体卡片名。所有评测目标卡片从
 * skill/config.yaml 的 `cards:` 段读取。
 *
 * 加载优先级（高 → 低）：
 *   1) 环境变量（CARDS_ROOT / CARDS_SUBDIR / ACT_AGENT_* 等）
 *   2) skill/config.yaml（skill 根目录的统一登记）
 *
 * 设计要点：
 * - 不引入 js-yaml / yaml 等 npm 依赖，自己实现一个最小 yaml 解析器：
 *   - 支持 section:（cards / agent 两个段）
 *   - 支持扁平 key: value + 数字 / 布尔 / null / 引号字符串
 *   - 支持 | 多行 scalar（公共缩进自动 strip）
 *   - 支持 # 注释
 * - config.yaml 先按统一 schema 校验，再进入下游消费。
 */

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

// ===== 路径 =====
const CONFIG_DIR = __dirname;
const ROOT_YAML = path.join(__dirname, '..', 'config.yaml'); // skill 根目录唯一 yaml
const CONFIG_SCHEMA_PATH = path.join(CONFIG_DIR, 'config.schema.json');

// ===== 缓存 =====
let yamlCache = null;        // skill/config.yaml 全量解析
let cardListCache = null;    // cards 列表

// ===== 极简 yaml 解析器（够本 skill 用） =====

/**
 * 解析多行 | scalar 的内容：去除每行公共前导空格。
 * @param {string[]} lines
 */
function stripCommonIndent(lines) {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^ */)[0].length);
  if (!indents.length) return lines;
  const min = Math.min(...indents);
  if (min === 0) return lines;
  return lines.map((l) => l.slice(min));
}

/**
 * 解析单段 yaml（段名已知）。
 * @param {string} text  段文本（不含 `section:` 头）
 * @returns {Object}
 */
function parseSection(text) {
  const out = {};
  const lines = text.split('\n');
  let multiKey = null;
  let multiBuf = [];

  const flushMulti = () => {
    if (multiKey == null) return;
    const stripped = stripCommonIndent(multiBuf);
    out[multiKey] = stripped.join('\n');
    multiKey = null;
    multiBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const noComment = raw.replace(/#.*$/, '');
    const stripped = noComment.replace(/\s+$/, '');
    if (!stripped.trim()) {
      if (multiKey != null) multiBuf.push('');
      continue;
    }
    if (multiKey != null) {
      if (/^\s/.test(raw) && stripped.trim()) {
        multiBuf.push(stripped);
        continue;
      }
      flushMulti();
    }
    if (/^\s*-\s+/.test(stripped)) {
      const m = stripped.match(/^\s*-\s+(.+?)\s*$/);
      if (m) {
        if (!out.__list) out.__list = [];
        let v = m[1].replace(/^['"]|['"]$/g, '');
        out.__list.push(v);
      }
      continue;
    }
    const m = stripped.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value === '|') {
      multiKey = key;
      multiBuf = [];
      continue;
    }
    value = value.replace(/^['"]|['"]$/g, '');
    if (value === 'true') out[key] = true;
    else if (value === 'false') out[key] = false;
    else if (value === 'null') out[key] = null;
    else if (value === '') out[key] = '';
    else if (/^-?\d+(\.\d+)?$/.test(value)) out[key] = Number(value);
    else out[key] = value;
  }
  flushMulti();
  return out;
}

/**
 * 解析整个 yaml（多段），返回按段名分组的对象。
 * @param {string} text
 * @returns {Object<string, Object>}
 */
function parseSimpleYaml(text) {
  const sections = {};
  const lines = text.split('\n');
  let curName = null;
  let curStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/#.*$/, '').replace(/\s+$/, '');
    if (!stripped.trim()) continue;
    const m = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (m && !/^\s/.test(raw)) {
      if (curName) {
        const slice = lines.slice(curStart, i).join('\n');
        sections[curName] = parseSection(slice);
      }
      curName = m[1];
      curStart = i + 1;
    }
  }
  if (curName) {
    const slice = lines.slice(curStart).join('\n');
    sections[curName] = parseSection(slice);
  }
  return sections;
}

/**
 * 用统一 schema 校验 config.yaml 的解析结果。
 * @param {Object<string, Object>} yaml
 */
function validateRootYaml(yaml) {
  const schema = JSON.parse(fs.readFileSync(CONFIG_SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(yaml)) {
    const msg = (validate.errors || [])
      .map((e) => `${e.instancePath || '/'} ${e.message}`)
      .join('; ');
    throw new Error(`config.yaml 校验失败: ${msg}`);
  }
}

/**
 * 读取 skill 根目录的 config.yaml 并按段返回（cache 一次）。
 * 读取后先走统一 schema 校验，再交给下游使用。
 * @returns {Object<string, Object>}
 */
function readRootYaml() {
  if (yamlCache) return yamlCache;
  if (!fs.existsSync(ROOT_YAML)) {
    throw new Error(`找不到配置文件：${ROOT_YAML}`);
  }
  const text = fs.readFileSync(ROOT_YAML, 'utf8');
  yamlCache = parseSimpleYaml(text);
  validateRootYaml(yamlCache);
  return yamlCache;
}

// ===== cards 加载 =====

/**
 * 读取 cards 列表。权威来源：skill/config.yaml 的 cards 段。
 * @returns {string[]}
 */
function loadCardList() {
  if (cardListCache) return cardListCache;
  const yaml = readRootYaml();
  const cards = yaml.cards && Array.isArray(yaml.cards.__list) && yaml.cards.__list.length
    ? yaml.cards.__list.slice()
    : null;
  if (!cards) {
    throw new Error(`找不到 cards 配置：${ROOT_YAML}（cards: 段）`);
  }
  cardListCache = cards.slice();
  return cardListCache;
}

function getCardSourceDir(cardsRoot, cardName, sourceSubdir = 'cards') {
  return path.join(cardsRoot, cardName, sourceSubdir, cardName);
}

function getCardDistDir(cardsRoot, cardName) {
  return path.join(cardsRoot, 'dist', cardName);
}

function getCardsRoot() {
  if (process.env.CARDS_ROOT) return path.resolve(process.env.CARDS_ROOT);
  const candidates = ['src', 'cards'];
  const base = path.resolve(__dirname, '..', '..');
  for (const name of candidates) {
    if (fs.existsSync(path.join(base, name))) return path.join(base, name);
  }
  return path.join(base, 'cards');
}

function getCardsSubdir() {
  if (process.env.CARDS_SUBDIR) return process.env.CARDS_SUBDIR;
  const root = getCardsRoot();
  try {
    const list = loadCardList();
    if (list.length) {
      const first = list[0];
      if (fs.existsSync(path.join(root, first, 'cards', first))) return 'cards';
      if (fs.existsSync(path.join(root, first, 'src', first))) return 'src';
    }
  } catch (_) {}
  return 'cards';
}

function getCardsDist() {
  return path.join(getCardsRoot(), 'dist');
}

module.exports = {
  CONFIG_DIR,
  ROOT_YAML,
  CONFIG_SCHEMA_PATH,
  parseSimpleYaml,
  parseSection,
  stripCommonIndent,
  readRootYaml,
  loadCardList,
  getCardSourceDir,
  getCardDistDir,
  getCardsRoot,
  getCardsSubdir,
  getCardsDist,
};
