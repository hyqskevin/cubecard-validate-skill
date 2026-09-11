#!/usr/bin/env node
/**
 * ACT Cube 卡片评测 Skill CLI（端到端评测循环 v2）
 *
 * 用法：
 *   node cli.js                                  # 默认全流程
 *   node cli.js --skip-build                     # 跳过编译
 *   node cli.js --stage validate                 # 只跑校验
 *   node cli.js --stage validate --card hello-cube
 *   node cli.js --card hello-cube,chart-bar      # 只跑这些卡片
 *   node cli.js --list-rules                     # 列出所有启用规则
 *   node cli.js --scaffold rule V12-no-inner-vfor --severity warning
 *   node cli.js --scaffold eslint no-mpaas-eval
 *   node cli.js --scaffold contract my-thing --description "..."
 *   node cli.js --scaffold test V12-no-inner-vfor
 *   node cli.js --report out.json                # 写报告
 *   node cli.js --lint                           # 仅对卡片 .vue 跑 SFC lint（独立子命令）
 *   node cli.js --lint --card hello-cube         # 仅 lint 指定卡片
 *
 * 配置：
 *   - config.yaml                卡片清单 + agent 参数（权威来源）
 *   - validate/rules.config.json 静态规则注册表 + severity
 *   - eslint/card.config.mjs     卡片 SFC lint 配置（vue/* + cube/* + JS，ESLint 侧真实来源）
 *   - 环境变量 CARDS_ROOT / CARDS_SUBDIR 兼容生产环境
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const md5 = require('md5');
const { getCardsRoot, getCardsDist, getCardsSubdir, loadCardList } = require('./config');
const { listAllRules } = require('./config/rules-loader');
const { validateCard, validateAll, summarize } = require('./validate/index');
const { scaffold } = require('./contracts/scaffolder');

const SKILL_DIR = __dirname;
const CARDS_DIR = getCardsRoot();
// 卡片专属测试目录：与 src/ 平级的 test/，不污染 ACT 打包目录
const TESTS_DIR = path.resolve(SKILL_DIR, '..', 'test');

// 在 PATH 不含 /opt/homebrew/bin 的环境里（部分 IDE 子进程），
// 自动补上 homebrew / linuxbrew 路径，否则 act 命令找不到
const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin'];
for (const p of EXTRA_PATHS) {
  if (fs.existsSync(p) && !process.env.PATH.includes(p)) {
    process.env.PATH = `${p}:${process.env.PATH}`;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    skipBuild: false,
    report: null,
    stage: null,           // 'build' | 'validate' | 'unit' | 'e2e' | 'eslint' | null=全
    cards: null,           // 'hello-cube,chart-bar' 形式的子集
    scaffold: null,        // { kind, idOrSlug, severity, description }
    listRules: false,
    agentGen: null,        // { input, cards, force, skipGen }
    lint: false,           // --lint：仅跑卡片 .vue SFC lint（独立子命令）
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--skip-build') opts.skipBuild = true;
    else if (a === '--report') opts.report = args[++i];
    else if (a === '--stage') opts.stage = args[++i];
    else if (a === '--card') {
      opts.cards = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
      process.env.CARDS_FILTER = opts.cards.join(',');
    } else if (a === '--list-rules') opts.listRules = true;
    else if (a === '--lint') opts.lint = true;
    else if (a === '--scaffold') {
      const kind = args[++i];
      const idOrSlug = args[++i];
      const o = { kind, idOrSlug };
      // 后续 --key value 对，按顺序解析直到下一个未知 key
      while (i + 1 < args.length && args[i + 1].startsWith('--')) {
        i++;
        const key = args[i];
        if (key === '--severity') o.severity = args[++i];
        else if (key === '--description') o.description = args[++i];
        else { i--; break; }
      }
      opts.scaffold = o;
    } else if (a === '--agent-gen') {
      // agent 生成模式
      // --agent-gen cases.csv [--card x,y] [--agent-force] [--agent-skip-gen]
      const input = args[++i];
      const ag = { input, cards: null, force: false, skipGen: false };
      while (i + 1 < args.length && args[i + 1].startsWith('--')) {
        i++;
        const k = args[i];
        if (k === '--card') ag.cards = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
        else if (k === '--agent-force') ag.force = true;
        else if (k === '--agent-skip-gen') ag.skipGen = true;
        else { i--; break; }
      }
      opts.agentGen = ag;
    }
  }
  return opts;
}

function runCmd(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`);
  const result = spawnSync(cmd, { stdio: 'inherit', shell: true, ...opts });
  return result.status === 0;
}

function runTests(fileOrPattern, opts = {}) {
  // 通用规则测试在 skill 内（cwd 默认 SKILL_DIR）；卡片专属测试在 act-cube/test/ 下
  const cwd = opts.cwd || SKILL_DIR;
  const absFile = path.isAbsolute(fileOrPattern)
    ? fileOrPattern
    : path.resolve(cwd, fileOrPattern);
  console.log(`\n▶ node --test ${path.relative(cwd, absFile)}`);
  // 子进程继承 CARDS_FILTER（cli.js --card 会设置），过滤测试子集
  const env = { ...process.env };
  if (process.env.CARDS_FILTER) env.CARDS_FILTER = process.env.CARDS_FILTER;
  const result = spawnSync('node', ['--test', absFile], {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env,
  });
  const stdout = result.stdout?.toString() || '';
  const stderr = result.stderr?.toString() || '';
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return { code: result.status, stdout, stderr };
}

function parseTestSummary(output) {
  const tests = output.match(/^# tests (\d+)/m);
  const pass = output.match(/^# pass (\d+)/m);
  const fail = output.match(/^# fail (\d+)/m);
  const cancelled = output.match(/^# cancelled (\d+)/m);
  const skipped = output.match(/^# skipped (\d+)/m);
  const duration = output.match(/^# duration_ms ([0-9.]+)/m);
  if (!tests) return { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, durationMs: 0 };
  return {
    tests: +tests[1],
    pass: pass ? +pass[1] : 0,
    fail: fail ? +fail[1] : 0,
    cancelled: cancelled ? +cancelled[1] : 0,
    skipped: skipped ? +skipped[1] : 0,
    durationMs: duration ? +duration[1] : 0,
  };
}

/**
 * 把 summary 渲染成 markdown 报告。人类可读版。
 */
function renderReportMarkdown(s) {
  const lines = [];
  const overall = (s.buildOk
    && (!s.validate || (s.validate.code === 0 && s.validate.fail === 0))
    && (!s.unit || (s.unit.code === 0 && s.unit.fail === 0))
    && (!s.e2e || (s.e2e.code === 0 && s.e2e.fail === 0))
    && (!s.eslint || (s.eslint.code === 0 && s.eslint.fail === 0)));
  const verdict = overall ? '✅ PASS' : '❌ FAIL';

  lines.push(`# ACT Cube 卡片评测报告`);
  lines.push('');
  lines.push(`- **时间**: ${s.timestamp}`);
  lines.push(`- **卡片清单**: ${(s.cards || []).join(', ') || '（无）'}`);
  lines.push(`- **总耗时**: ${s.durationMs} ms`);
  lines.push(`- **结论**: ${verdict}`);
  lines.push('');

  // 各级别表
  lines.push(`## 1. 各级别汇总`);
  lines.push('');
  lines.push(`| 阶段 | 项数 | 通过 | 失败 | 取消 | 跳过 | 退出码 |`);
  lines.push(`|------|------|------|------|------|------|--------|`);
  for (const k of ['build', 'validate', 'unit', 'e2e', 'eslint']) {
    if (k === 'build') {
      lines.push(`| build | - | ${s.buildOk ? '✓' : '✗'} | - | - | - | ${s.buildOk ? 0 : 1} |`);
    } else if (s[k]) {
      const x = s[k];
      lines.push(`| ${k} | ${x.tests} | ${x.pass} | ${x.fail} | ${x.cancelled || 0} | ${x.skipped || 0} | ${x.code} |`);
    }
  }
  lines.push('');

  // 产物指纹
  if (s.fingerprints && Object.keys(s.fingerprints).length) {
    lines.push(`## 2. 产物指纹 (md5)`);
    lines.push('');
    lines.push('```');
    for (const [k, v] of Object.entries(s.fingerprints)) {
      lines.push(`${k}  ${v}`);
    }
    lines.push('```');
    lines.push('');
  }

  // 失败详情
  const failures = [];
  for (const k of ['validate', 'unit', 'e2e', 'eslint']) {
    if (s[k] && s[k].fail > 0) {
      failures.push({ stage: k, fail: s[k].fail, details: extractFailures(s[`_${k}RawOutput`] || '') });
    }
  }
  if (failures.length) {
    lines.push(`## 3. 失败详情`);
    lines.push('');
    for (const f of failures) {
      lines.push(`### ${f.stage} (${f.fail} fail)`);
      lines.push('');
      if (f.details.length) {
        for (const d of f.details) lines.push(`- ${d}`);
      } else {
        lines.push('（无明细）');
      }
      lines.push('');
    }
  } else {
    lines.push(`## 3. 失败详情`);
    lines.push('');
    lines.push('无。');
    lines.push('');
  }

  // 建议
  lines.push(`## 4. 建议`);
  lines.push('');
  if (overall) {
    lines.push('- 全部通过。卡片可以进入下一阶段（集成测试 / 真机回归）。');
  } else {
    lines.push('- 修复上面"失败详情"列出的失败项后重跑 `node cli.js --skip-build`。');
    lines.push('- 单条子集调试：先 `--card <name>` 缩小范围。');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * 从 test runner 输出里提取 fail 的 subtest 标题（"not ok ..."）。
 */
function extractFailures(output) {
  const out = [];
  const lines = output.split('\n');
  let inFailureBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^    not ok \d+ - /.test(line)) {
      out.push(line.replace(/^    not ok \d+ - /, '').trim());
    }
  }
  return out;
}

/**
 * 计算 dist/<card>/main.js 等产物的 md5 指纹。
 */
function fingerprintProducts() {
  const distDir = getCardsDist();
  if (!fs.existsSync(distDir)) return {};
  const out = {};
  for (const name of fs.readdirSync(distDir)) {
    const cardDir = path.join(distDir, name);
    let stat;
    try { stat = fs.statSync(cardDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    for (const f of ['main.js', 'main.json', 'main.mock']) {
      const fp = path.join(cardDir, f);
      if (!fs.existsSync(fp)) continue;
      const buf = fs.readFileSync(fp);
      out[`${name}/${f}`] = md5(buf);
    }
  }
  return out;
}

/**
 * 处理 --list-rules 子命令。
 */
function handleListRules() {
  console.log('══════════════════════════════════════════════');
  console.log('   当前启用的规则（validate/rules.config.json）');
  console.log('══════════════════════════════════════════════');
  const all = listAllRules();
  if (all.length === 0) {
    console.log('（validate/rules.config.json 为空）');
    return;
  }
  // 表头
  console.log('ID'.padEnd(8) + 'Severity'.padEnd(10) + 'Enabled'.padEnd(8) + 'Module');
  console.log('-'.repeat(60));
  for (const r of all) {
    console.log(
      r.id.padEnd(8) +
      (r.severity || '-').padEnd(10) +
      String(r.enabled !== false).padEnd(8) +
      (r.module || '-')
    );
  }
}

/**
 * 处理 --scaffold 子命令。
 */
function handleScaffold(o) {
  const { kind, idOrSlug, severity, description } = o;
  const out = scaffold(kind, idOrSlug, { severity, description });
  console.log('══════════════════════════════════════════════');
  console.log(`   scaffold: ${kind} ${idOrSlug}`);
  console.log('══════════════════════════════════════════════');
  for (const f of out.files) console.log(`  写入：${path.relative(SKILL_DIR, f)}`);
  if (out.configUpdated) console.log('  rules.config.json 已更新');
}

/**
 * 处理 --lint 子命令。
 *
 * 用 ESLint + eslint.card.config.mjs（vue/* + cube/* + JS 规则）
 * 直接对每张卡片 .vue 跑 SFC lint（不走 node --test 套件）。
 *
 *   - node cli.js --lint
 *   - node cli.js --lint --card hello-cube
 *
 * 退出码：0=全部通过；1=有 error；2=ESLint 自身异常。
 */
async function handleLint(opts) {
  console.log('══════════════════════════════════════════════');
  console.log('   ACT Cube 卡片 SFC lint');
  console.log('══════════════════════════════════════════════');

  const configPath = path.join(SKILL_DIR, 'eslint', 'card.config.mjs');
  if (!fs.existsSync(configPath)) {
    console.error(`✖ 找不到配置: ${configPath}`);
    return 2;
  }
  const cards = opts.cards && opts.cards.length ? opts.cards : loadCardList();
  if (opts.cards && opts.cards.length) process.env.CARDS_FILTER = opts.cards.join(',');

  const CARDS_SUBDIR = getCardsSubdir();
  const vueFiles = [];
  for (const name of cards) {
    const vuePath = path.join(CARDS_DIR, name, CARDS_SUBDIR, name, 'main.vue');
    if (!fs.existsSync(vuePath)) {
      console.error(`✖ 卡片源文件不存在: ${vuePath}`);
      return 2;
    }
    vueFiles.push(vuePath);
  }
  console.log(`配置:  ${path.relative(SKILL_DIR, configPath)}`);
  console.log(`卡片:  ${cards.length} 张`);
  console.log(`文件:  ${vueFiles.length} 个`);
  console.log('');

  // 动态 import ESLint（顶层 require 是 CommonJS，安全）
  const { ESLint } = require('eslint');
  // ESLint v9 flat config 默认必须文件路径在 basePath 内。卡片在 CARDS_DIR 下
  // （不在 skill 目录），所以 basePath 设为 CARDS_DIR。
  const eslint = new ESLint({
    overrideConfigFile: configPath,
    cwd: CARDS_DIR,
  });

  let totalErrors = 0;
  let totalWarnings = 0;
  const failed = [];

  try {
    const results = await eslint.lintFiles(vueFiles);
    for (const result of results) {
      // 取卡片名（results[i].filePath 是 .../cards/<card>/main.vue）
      const m = result.filePath.match(/\/cards\/([^/]+)\/main\.vue$/);
      const cardName = m ? m[1] : path.basename(result.filePath);
      const errors = result.messages.filter((x) => x.severity === 2);
      const warnings = result.messages.filter((x) => x.severity === 1);
      const fatals = result.errorCount || 0;

      if (errors.length === 0 && fatals === 0 && warnings.length === 0) {
        console.log(`✓ ${cardName}  通过 (0 errors, 0 warnings)`);
      } else {
        totalErrors += errors.length;
        totalWarnings += warnings.length;
        failed.push(cardName);
        console.log(`✗ ${cardName}  ${errors.length} errors, ${warnings.length} warnings`);
        for (const m of [...errors, ...warnings]) {
          const sev = m.severity === 2 ? 'error' : 'warning';
          console.log(`    [${sev}] ${m.ruleId || 'parser'}  ${m.message.replace(/\s+/g, ' ')}  (L${m.line || '-'})`);
        }
      }
    }
  } catch (e) {
    console.error(`✖ ESLint 异常: ${e.message}`);
    if (e.stack) console.error(e.stack);
    return 2;
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log(`   汇总：${totalErrors} errors / ${totalWarnings} warnings（${failed.length} 张不通过）`);
  console.log('══════════════════════════════════════════════');

  // 退出码：1=有 error；0=全通过（包括只有 warning）
  return totalErrors > 0 ? 1 : 0;
}

/**
 * 端到端评测循环：
 *   - 如果 --card 指定子集，则只对该子集跑校验 + 单测 + E2E + ESLint
 *   - 否则走 config.yaml 的 cards 全集
 */
function runFullLoop(opts) {
  const startTime = Date.now();
  const summary = {
    timestamp: new Date().toISOString(),
    cards: opts.cards || loadCardList(),
    buildOk: true,
    validate: null,
    unit: null,
    e2e: null,
    eslint: null,
    perCard: {},              // 卡片专属测试：{ <card>: { tests, pass, fail, ... } }
    fingerprints: null,
    durationMs: 0,
  };

  console.log('══════════════════════════════════════════════');
  console.log(`   ACT Cube 卡片评测 Skill${opts.cards ? `（子集：${opts.cards.join(', ')}）` : ''}`);
  console.log('══════════════════════════════════════════════');

  // 1. 编译（默认全量；子集模式下也跑全量 act build，因为编译是连动的）
  if (!opts.skipBuild) {
    summary.buildOk = runCmd(`act build ${CARDS_DIR}`);
    if (!summary.buildOk) {
      console.error('\n✖ act build 失败，跳过后续步骤');
      process.exit(1);
    }
    summary.fingerprints = fingerprintProducts();
    console.log('\n▶ 产物指纹 (md5)：');
    for (const [k, v] of Object.entries(summary.fingerprints)) {
      console.log(`    ${k}  ${v}`);
    }
  } else {
    console.log('\n▶ 跳过 act build（--skip-build）');
  }

  // 评测顺序按"先快后慢、先源码后产物"原则：
  //   eslint（源码规范，最快）→ validate（源码 AST 深度检查）→
  //   unit（产物结构）→ e2e（运行时引擎，最慢）
  // 这样低级问题在几秒内被 eslint 拦截，不用等 validate/e2e 跑完才暴露。

  // 1. ESLint 代码规范
  if (!opts.stage || opts.stage === 'eslint') {
    console.log('\n══════════════════════════════════════════════');
    console.log('   1/4 ESLint 代码规范');
    console.log('══════════════════════════════════════════════');
    const eslintResult = runTests('eslint/index.test.js', { cwd: SKILL_DIR });
    const fullOutput = eslintResult.stdout + eslintResult.stderr;
    summary.eslint = {
      code: eslintResult.code,
      ...(parseTestSummary(fullOutput) || {}),
    };
    summary._eslintRawOutput = fullOutput;
  }

  // 2. 静态校验（源码 AST 深度检查）
  if (!opts.stage || opts.stage === 'validate') {
    console.log('\n══════════════════════════════════════════════');
    console.log('   2/4 静态校验');
    console.log('══════════════════════════════════════════════');
    const validateResult = runTests('validate/index.test.js', { cwd: SKILL_DIR });
    const fullOutput = validateResult.stdout + validateResult.stderr;
    summary.validate = {
      code: validateResult.code,
      ...(parseTestSummary(fullOutput) || {}),
    };
    summary._validateRawOutput = fullOutput;
  }

  // 3. 产物单测
  if (!opts.stage || opts.stage === 'unit') {
    console.log('\n══════════════════════════════════════════════');
    console.log('   3/4 单元测试');
    console.log('══════════════════════════════════════════════');
    const unitResult = runTests('unit/index.test.js', { cwd: SKILL_DIR });
    const fullOutput = unitResult.stdout + unitResult.stderr;
    summary.unit = {
      code: unitResult.code,
      ...(parseTestSummary(fullOutput) || {}),
    };
    summary._unitRawOutput = fullOutput;
  }

  // 4. 运行时 E2E
  if (!opts.stage || opts.stage === 'e2e') {
    console.log('\n══════════════════════════════════════════════');
    console.log('   4/4 E2E 测试');
    console.log('══════════════════════════════════════════════');
    const e2eResult = runTests('e2e/index.test.js', { cwd: SKILL_DIR });
    const fullOutput = e2eResult.stdout + e2eResult.stderr;
    summary.e2e = {
      code: e2eResult.code,
      ...(parseTestSummary(fullOutput) || {}),
    };
    summary._e2eRawOutput = fullOutput;
  }

  // 5. 卡片专属测试：通用规则校验（上面 1-4）全部跑完后，
  //    对每张卡片跑 test/<card>/main.test.js（agent api 为该卡生成）。
  //    测试文件与卡片源码分离：src/ 只放 .vue/.json，测试放 test/。
  if (!opts.stage || opts.stage === 'card') {
    console.log('\n══════════════════════════════════════════════');
    console.log('   5/5 卡片专属测试（agent 生成）');
    console.log('══════════════════════════════════════════════');
    const TESTS_ROOT = TESTS_DIR;
    for (const name of summary.cards) {
      const cardDir = path.join(TESTS_ROOT, name);
      const cardTestPath = path.join(cardDir, 'main.test.js');
      if (!fs.existsSync(cardTestPath)) {
        console.log(`\n（跳过：${name} 没有专属测试 test/${name}/main.test.js）`);
        continue;
      }
      // cwd 用测试目录，让 main.test.js 里的 require('../../skill/...') 解析正确
      const cardResult = runTests(cardTestPath, { cwd: cardDir });
      const fullOutput = cardResult.stdout + cardResult.stderr;
      summary.perCard[name] = {
        code: cardResult.code,
        ...(parseTestSummary(fullOutput) || {}),
      };
    }
    if (Object.keys(summary.perCard).length === 0) {
      console.log('\n（本次没有可跑的卡片专属测试）');
    }
  }

  summary.durationMs = Date.now() - startTime;
  printSummary(summary);

  if (opts.report) {
    const reportBase = opts.report.replace(/\.(json|md)$/i, '');
    const jsonPath = `${reportBase}.json`;
    const mdPath = `${reportBase}.md`;
    // 写 markdown（需要 _rawOutput 提取失败明细）
    fs.writeFileSync(mdPath, renderReportMarkdown(summary));
    // 写 json（去掉 _rawOutput 这种内部字段）
    const jsonSummary = { ...summary };
    for (const k of Object.keys(jsonSummary)) {
      if (k.startsWith('_')) delete jsonSummary[k];
    }
    fs.writeFileSync(jsonPath, JSON.stringify(jsonSummary, null, 2));
    // 同时把"最新一次"的副本写到 skill/out/report.last.json 供 CI / IDE 抓取
    const lastPath = path.join(SKILL_DIR, 'out', 'report.last.json');
    try {
      fs.mkdirSync(path.join(SKILL_DIR, 'out'), { recursive: true });
      fs.writeFileSync(lastPath, JSON.stringify(jsonSummary, null, 2));
    } catch (_) {}
    console.log(`\n报告已写入：`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  MD:   ${mdPath}`);
    console.log(`  Last: ${lastPath}`);
  }

  // exit code
  const perCardFail = Object.values(summary.perCard).some((r) => r.code !== 0 || r.fail > 0);
  const allPass = summary.buildOk &&
    (!summary.validate || (summary.validate.code === 0 && summary.validate.fail === 0)) &&
    (!summary.unit || (summary.unit.code === 0 && summary.unit.fail === 0)) &&
    (!summary.e2e || (summary.e2e.code === 0 && summary.e2e.fail === 0)) &&
    (!summary.eslint || (summary.eslint.code === 0 && summary.eslint.fail === 0)) &&
    !perCardFail;
  process.exit(allPass ? 0 : 1);
}

function printSummary(summary) {
  console.log('\n══════════════════════════════════════════════');
  console.log('   汇总');
  console.log('══════════════════════════════════════════════');
  const lines = [];
  lines.push(`# Cards:       ${summary.cards.length}（${summary.cards.slice(0, 5).join(', ')}${summary.cards.length > 5 ? ', ...' : ''}）`);
  lines.push(`# Build:       ${summary.buildOk ? '✓ PASS' : '✗ FAIL'}`);
  if (summary.validate) lines.push(`# Validate:    ${summary.validate.pass}/${summary.validate.tests} pass`);
  if (summary.unit) lines.push(`# Unit:        ${summary.unit.pass}/${summary.unit.tests} pass`);
  if (summary.e2e) lines.push(`# E2E:         ${summary.e2e.pass}/${summary.e2e.tests} pass`);
  if (summary.eslint) lines.push(`# ESLint:      ${summary.eslint.pass}/${summary.eslint.tests} pass`);
  for (const [name, r] of Object.entries(summary.perCard)) {
    lines.push(`# [Card] ${name}:  ${r.pass}/${r.tests} pass`);
  }
  const totalPass = (summary.validate?.pass || 0) + (summary.unit?.pass || 0) +
    (summary.e2e?.pass || 0) + (summary.eslint?.pass || 0) +
    Object.values(summary.perCard).reduce((s, r) => s + (r.pass || 0), 0);
  const totalFail = (summary.validate?.fail || 0) + (summary.unit?.fail || 0) +
    (summary.e2e?.fail || 0) + (summary.eslint?.fail || 0) +
    Object.values(summary.perCard).reduce((s, r) => s + (r.fail || 0), 0);
  const totalTests = totalPass + totalFail;
  lines.push(`# Total:       ${totalPass}/${totalTests} pass (${summary.durationMs}ms)`);
  console.log(lines.join('\n'));
}

async function main() {
  const opts = parseArgs();

  if (opts.listRules) {
    handleListRules();
    return 0;
  }
  if (opts.scaffold) {
    handleScaffold(opts.scaffold);
    return 0;
  }
  if (opts.agentGen) {
    return await handleAgentGen(opts.agentGen);
  }
  if (opts.lint) {
    return await handleLint(opts);
  }

  runFullLoop(opts);
  return 0;
}

/**
 * 解析 agent 输入文件路径：
 *   - 显式以 .csv / .xlsx / .xls / .txt 结尾 → 直接用该路径（含 card 列）
 *   - 不带后缀 → 当成 test/<card>/cases.csv 形式：尝试 test/<input>/cases.csv，
 *     找到则按「单卡」模式处理（card 从目录名取）
 *
 * 返回 {input, card, single}：single 模式下 card 即为目录名。
 */
function resolveAgentInput(p) {
  const ext = path.extname(p).toLowerCase();
  if (['.csv', '.xlsx', '.xls', '.txt'].includes(ext)) {
    return { input: path.resolve(p), card: null, single: false, fromExcel: true };
  }
  // 当作卡片 id 试：优先 test/<card>/cases.csv
  const cardCsv = path.join(TESTS_DIR, p, 'cases.csv');
  if (fs.existsSync(cardCsv)) {
    return { input: cardCsv, card: p, single: true, fromExcel: true };
  }
  // 无 Excel 场景：按卡片源码自动生成 case.md + main.test.js
  return { input: null, card: p, single: true, fromExcel: false };
}

/**
 * agent 子命令。
 * 用法：
 *   node cli.js --agent-gen cases.csv                       # 全量：CSV→case.md→main.test.js
 *   node cli.js --agent-gen cases.csv --card hello-cube     # 只处理指定卡
 *   node cli.js --agent-gen cases.csv --card hello-cube --force
 *
 * 输入：
 *   - 全量 csv：act-cube/cases.csv，含 card 列
 *   - 单卡 csv：test/<card>/cases.csv，只有该卡片片（自动取 card=目录名）
 *
 * 产物：写到 test/<card>/（测试与源码分离，不污染 ACT 打包目录）。
 */
async function handleAgentGen({ input, cards, force, skipGen }) {
  const resolved = resolveAgentInput(input);
  console.log('══════════════════════════════════════════════');
  console.log('   ACT Cube Agent 生成器');
  console.log('══════════════════════════════════════════════');
  if (resolved.input) console.log(`输入: ${resolved.input}`);
  if (resolved.card) console.log(`单卡模式: ${resolved.card}`);
  if (!resolved.fromExcel) console.log('模式: 无 Excel，通过阅读卡片源码生成 case.md 与 main.test.js');
  console.log('');

  let targetCards = [];
  let caseMdPaths = new Map();

  if (resolved.fromExcel) {
    const excelConv = require('./agent/excel-converter');
    const converted = excelConv.convert(resolved.input, {
      cardsRoot: TESTS_DIR,
      defaultCard: resolved.card,
    });
    targetCards = cards && cards.length ? cards : converted.cards;
    caseMdPaths = converted.caseMdPaths;
    console.log(`✔ 已生成 ${converted.cards.length} 张卡的 case.md（共 ${converted.caseCount} 条用例）`);
    for (const card of converted.cards) {
      const p = converted.caseMdPaths.get(card);
      console.log(`  - ${card}: ${path.relative(SKILL_DIR, p)}`);
    }
  } else {
    targetCards = cards && cards.length ? cards : [resolved.card];
  }

  console.log(`\n将生成 main.test.js 的卡: ${targetCards.join(', ')}`);

  let agentCfg;
  try {
    agentCfg = require('./config/agent-loader').loadAgentConfig();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    return 1;
  }
  if (!agentCfg.enabled) {
    console.error('\n✖ agent 未启用：请把 config.yaml 的 agent.enabled 设为 true，或通过环境变量 ACT_AGENT_ENABLED=true / ACT_AGENT_API_KEY=... 注入');
    return 2;
  }

  const casegen = require('./agent/casegen');
  const testgen = require('./agent/testgen');
  let ok = 0, fail = 0;

  for (const card of targetCards) {
    const outDir = path.join(TESTS_DIR, card);
    let caseMdPath = caseMdPaths.get(card);

    if (!resolved.fromExcel) {
      process.stdout.write(`\n→ ${card}: 调 LLM 生成 case.md ... `);
      try {
        const r = await casegen.generateCaseMd(card, {
          minCases: agentCfg.minCases,
          outDir,
          force,
        });
        if (r.ok) {
          console.log(`✔ ${r.bytes} bytes → ${path.relative(SKILL_DIR, r.outPath)}`);
          caseMdPath = r.outPath;
        } else {
          console.log(`✖ ${r.reason}`);
          fail++;
          continue;
        }
      } catch (e) {
        console.log(`✖ case.md 生成失败: ${e.message}`);
        fail++;
        continue;
      }
    }

    if (skipGen) continue;

    if (!caseMdPath || !fs.existsSync(caseMdPath)) {
      console.log(`\n（${card} 没有 case.md，跳过）`);
      continue;
    }

    const caseMd = fs.readFileSync(caseMdPath, 'utf8');
    process.stdout.write(`\n→ ${card}: 调 LLM 生成 main.test.js ... `);
    try {
      const r = await testgen.generate(card, {
        caseMd,
        outDir,
        force,
        minCases: agentCfg.minCases,
      });
      if (r.ok) {
        console.log(`✔ ${r.bytes} bytes → ${path.relative(SKILL_DIR, r.outPath)}`);
        ok++;
      } else {
        console.log(`✖ ${r.reason}`);
        fail++;
      }
    } catch (e) {
      console.log(`✖ LLM 调用失败: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n生成结果：成功 ${ok} / 失败 ${fail}`);
  return fail === 0 ? 0 : 1;
}

main().then((code) => process.exit(code || 0));