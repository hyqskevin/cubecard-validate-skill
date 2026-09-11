/**
 * 测试案例 Excel/CSV → case.md 转换器。
 *
 * 输入：Excel 或 CSV 文件，约定列（首行表头）：
 *   case_id  - 用例 ID（必填）
 *   card     - 卡片 ID（必填，用于分组到 test/<card>/case.md）
 *   module   - 模块名（如 "methods.onClick"），可空
 *   title    - 用例标题（必填）
 *   pre_state - 前置状态描述，可空
 *   steps    - 步骤描述，可空
 *   expected - 预期结果（必填）
 *   priority - P0/P1/P2，可空
 *   tags     - 标签（逗号分隔），可空
 *
 * 输出：
 *   test/<card>/case.md —— 每张卡一个，case 按优先级排序，结构化 markdown。
 *   默认落点为 act-cube/test/，可通过 opts.cardsRoot 或 opts.cardDirResolver 自定义。
 *
 * 设计：
 * - 支持 CSV（自实现极简解析，逗号引号转义）
 * - 支持 XLSX（尝试 require('xlsx')，失败时给清晰错误提示）
 * - 按 card 分组，每张卡产一个 md 文件
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * 极简 CSV 解析。引号包裹字段支持逗号 / 双引号转义（"a""b" → a"b）。
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += c; i++;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = ''; i++; continue;
      }
      if (c === '\r') { i++; continue; }
      cell += c; i++;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell); rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/**
 * 读 Excel：返回 [{case_id, card, ...}, ...]
 * 优先尝试 xlsx 库，没有则报错。
 */
function readExcelOrCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`测试案例文件不存在: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || ext === '.txt') {
    const text = fs.readFileSync(filePath, 'utf8');
    const rows = parseCsv(text);
    return rowsToObjects(rows);
  }
  if (ext === '.xlsx' || ext === '.xls') {
    // xlsx 包只在 skill/node_modules 下，cli 从 act-cube/ 根跑时需要绝对路径定位
    const xlsx = requireXlsx();
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return rowsToObjects(rows);
  }
  throw new Error(`不支持的格式: ${ext}（支持 .csv / .xlsx / .xls）`);
}

/**
 * 解析 xlsx 模块。xlsx 不在 package.json（项目 npm install 受 eslint-plugin-prettier
 * peer 冲突影响），这里优先用 require('xlsx')（skill cwd 下有效），失败则走
 * 绝对路径 require。
 */
function requireXlsx() {
  try {
    return require('xlsx');
  } catch (_) {
    // fallback: skill/node_modules/xlsx 绝对路径
    const abs = path.resolve(__dirname, '..', '..', 'node_modules', 'xlsx');
    return require(abs);
  }
}

function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => String(c).trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || c === '')) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = row[j] != null ? String(row[j]).trim() : '';
    }
    out.push(obj);
  }
  return out;
}

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 };

/**
 * 把一条 case 渲染成 markdown 章节。
 */
function renderCase(c, idx) {
  const lines = [];
  lines.push(`### ${idx + 1}. [${c.case_id || 'CASE-' + (idx + 1)}] ${c.title || '(无标题)'}`);
  lines.push('');
  if (c.priority) lines.push(`- **优先级**: ${c.priority}`);
  if (c.module) lines.push(`- **模块**: ${c.module}`);
  if (c.tags) lines.push(`- **标签**: ${c.tags}`);
  if (c.pre_state) lines.push(`- **前置状态**: ${c.pre_state}`);
  if (c.steps) lines.push(`- **步骤**:\n\n${c.steps.split(/\n+/).map((l) => '  ' + l).join('\n')}`);
  if (c.expected) lines.push(`- **预期**: ${c.expected}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * 把全量 case 列表按 card 分组，每组产一个 case.md 内容。
 * @returns {Map<string, string>} card -> md 文本
 */
function groupByCard(cases) {
  const groups = new Map();
  for (const c of cases) {
    const card = c.card;
    if (!card) continue;
    if (!groups.has(card)) groups.set(card, []);
    groups.get(card).push(c);
  }

  const out = new Map();
  for (const [card, list] of groups) {
    list.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] != null ? PRIORITY_ORDER[a.priority] : 9;
      const pb = PRIORITY_ORDER[b.priority] != null ? PRIORITY_ORDER[b.priority] : 9;
      if (pa !== pb) return pa - pb;
      return (a.case_id || '').localeCompare(b.case_id || '');
    });
    const lines = [];
    lines.push(`# ${card} 测试案例`);
    lines.push('');
    lines.push(`> 自动生成自测试案例 Excel/CSV。本文件由 agent 读取，结合卡片代码生成 main.test.js。`);
    lines.push('');
    lines.push(`## 总览`);
    lines.push('');
    lines.push(`- 用例总数：${list.length}`);
    const byPrio = list.reduce((m, c) => { const p = c.priority || 'P?'; m[p] = (m[p] || 0) + 1; return m; }, {});
    lines.push(`- 优先级分布：${Object.entries(byPrio).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    lines.push('');
    lines.push(`## 用例详情`);
    lines.push('');
    list.forEach((c, i) => lines.push(renderCase(c, i)));
    out.set(card, lines.join('\n'));
  }
  return out;
}

/**
 * 一次性把 Excel/CSV 转成 case.md，按 card 写到各自目录里。
 *
 * @param {string} inputPath   Excel/CSV 文件
 * @param {object} [opts]
 * @param {string} [opts.cardsRoot]   测试根目录（默认 act-cube/test）；每张卡的 case.md 写到
 *                                    `<cardsRoot>/<card>/case.md`
 * @param {(card:string)=>string} [opts.cardDirResolver] 自定义每张卡的落点目录解析函数
 * @param {string} [opts.defaultCard] 单卡 CSV 无 card 列时，使用该 card 作为兜底
 * @returns {{cards:string[], caseMdPaths:Map<string,string>, caseCount:number}}
 */
function convert(inputPath, opts = {}) {
  let cases = readExcelOrCsv(inputPath);
  // 单卡 csv 没有 card 列时，全部归到 defaultCard
  if (opts.defaultCard) {
    cases = cases.map((c) => ({ ...c, card: c.card || opts.defaultCard }));
  }
  const groups = groupByCard(cases);
  const cardDirResolver = opts.cardDirResolver
    || ((card) => path.join(opts.cardsRoot || path.resolve(__dirname, '..', '..', '..', 'test'), card));
  const caseMdPaths = new Map();
  for (const [card, md] of groups) {
    const dir = cardDirResolver(card);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'case.md');
    fs.writeFileSync(filePath, md, 'utf8');
    caseMdPaths.set(card, filePath);
  }
  return {
    cards: [...groups.keys()],
    caseMdPaths,
    caseCount: cases.length,
  };
}

module.exports = { convert, readExcelOrCsv, groupByCard, parseCsv, renderCase };
