/**
 * 规则 / 脚手架生成器
 *
 * 用法：
 *   node cli.js --scaffold rule V24-xxx-name --severity warning
 *   node cli.js --scaffold eslint no-xxx-rule
 *   node cli.js --scaffold test V24-xxx-name
 *
 * 当前结构约定：
 *   - validate 规则：skill/validate/rules/<dim>/V{n}-{slug}.js
 *   - validate 注册表：skill/validate/rules.config.json
 *   - ESLint 规则实现：skill/eslint/plugin.js
 *   - ESLint 真实启用来源：skill/eslint/card.config.mjs
 *
 * 因此：
 *   - rule / contract / test 会继续写 validate 侧文件；
 *   - eslint 规则只会追加到 eslint/plugin.js，并尝试把规则登记进 eslint/card.config.mjs。
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILL_ROOT = path.resolve(__dirname, '..');

function generateRuleFile(id, slug, opts = {}) {
  const { description = '', category = '通用' } = opts;
  return `/**
 * ${id}: ${description || slug}
 *
 * 由 scaffolder 生成的骨架规则：
 *   - 实现：buildContext 已经解析了 main.vue（vueContent / scriptAst /
 *     templateAst / classified / elements / scriptIdentifiers / vForLocals）
 *   - 入口：check(ctx, result, cardName)，往 result.errors/warnings/info
 *     里 push 字符串
 *   - 严重度：在 validate/rules.config.json 里声明（error / warning / info）
 */

const _CATEGORY = '${category}';
const _SLUG = '${slug}';

function check(ctx, result, cardName) {
  // TODO: 在此写校验逻辑。示例：
  //
  //   if (!ctx.classified) return;
  //   for (const el of ctx.elements) {
  //     // el.tag / el.attrs / el.line 都可用
  //     result.warnings.push(\`${id}: <\${el.tag}> 不合规\`);
  //   }
}

module.exports = { check, _SLUG, _CATEGORY };
`;
}

function generateEslintRule(slug, opts = {}) {
  const { description = '' } = opts;
  const constName = `${slug.replace(/-/g, '_')}Rule`;
  return `
/** @type {import('eslint').Rule.RuleModule} */
const ${constName} = {
  meta: {
    type: 'problem',
    docs: {
      description: '${description || slug}',
    },
    schema: [],
    messages: {
      forbidden: '${slug} 不符合项目规范',
    },
  },
  create(context) {
    return {
      Identifier(node) {
        if (/YOUR_PATTERN/.test(node.name)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

module.exports._registerRule = module.exports._registerRule || [];
module.exports._registerRule.push(['${slug}', ${constName}]);
`;
}

function generateValidateTest(id, slug, opts = {}) {
  return `
// ===== ${id} (${slug}) =====
describe('${id}: ${opts.description || slug}', () => {
  test('正向：合法卡片不报 ${id}', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'v-scaffold-'));
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
    fs.writeFileSync(path.join(tmpDir, 'main.vue'), '<template><div></div></template><script>export default {}</script>');
    const r = validateCard(tmpDir);
    const msgs = [...r.errors, ...r.warnings, ...r.info];
    assert.equal(msgs.filter((m) => m.startsWith('${id}')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('反向：故意构造的坏卡应被 ${id} 命中', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'v-scaffold-'));
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
    fs.writeFileSync(path.join(tmpDir, 'main.vue'), '<template><div></div></template><script>export default {}</script>');
    const r = validateCard(tmpDir);
    // TODO: 调整断言，例如：
    // assert.ok(r.warnings.some((w) => w.startsWith('${id}')));
    fs.rmSync(tmpDir, { recursive: true });
  });
});
`;
}

function generateEslintTest(slug, opts = {}) {
  return `
describe('cube/${slug} 反向测试', () => {
  test('故意写违反 cube/${slug} 的代码应被命中', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      baseConfig: {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { cube: cubePlugin },
        rules: { 'cube/${slug}': '${opts.severity || 'error'}' },
      },
    });
    const tmpFile = path.join(__dirname, '.tmp-${slug}.js');
    fs.writeFileSync(tmpFile, 'YOUR_BAD_SOURCE_HERE');
    try {
      const results = await eslint.lintFiles([tmpFile]);
      const messages = results.flatMap((r) => r.messages);
      // TODO: 断言 messages 含 cube/${slug} 的命中
      // assert.ok(messages.some((m) => m.ruleId === 'cube/${slug}'));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
`;
}

function appendRuleConfig(rule) {
  const configPath = path.join(SKILL_ROOT, 'validate', 'rules.config.json');
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const idx = cfg.rules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) cfg.rules[idx] = { ...cfg.rules[idx], ...rule };
  else cfg.rules.push(rule);
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
}

function upsertCardConfigRule(slug, severity) {
  const cardConfigPath = path.join(SKILL_ROOT, 'eslint', 'card.config.mjs');
  const text = fs.readFileSync(cardConfigPath, 'utf8');
  const ruleId = `cube/${slug}`;
  const line = `      '${ruleId}': '${severity}',`;
  if (text.includes(`'${ruleId}'`)) return false;
  const marker = '      // ===== ESLint 内置 JS 规则（与本 skill 工程保持一致）=====';
  if (!text.includes(marker)) {
    throw new Error(`未能在 eslint/card.config.mjs 找到插入点：${marker}`);
  }
  const next = text.replace(marker, `${line}\n\n${marker}`);
  fs.writeFileSync(cardConfigPath, next, 'utf8');
  return true;
}

function appendValidateTest(id, slug, opts = {}) {
  const file = path.join(SKILL_ROOT, 'validate', 'index.test.js');
  fs.appendFileSync(file, generateValidateTest(id, slug, opts));
  return file;
}

function appendEslintTest(slug, opts = {}) {
  const file = path.join(SKILL_ROOT, 'eslint', 'index.test.js');
  fs.appendFileSync(file, generateEslintTest(slug, opts));
  return file;
}

function scaffold(kind, idOrSlug, options = {}) {
  const out = { files: [], configUpdated: false };
  if (kind === 'rule' || kind === 'contract') {
    const m = idOrSlug.match(/^(V\d+)-([a-z0-9-]+)$/i);
    if (!m) throw new Error('规则 id 应为 V{n}-{slug} 形式，如 V24-no-inner-vfor');
    const [, id, slug] = m;
    const dir = kind === 'contract'
      ? path.join(SKILL_ROOT, 'contracts')
      : path.join(SKILL_ROOT, 'validate', 'rules');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}-${slug}.js`);
    fs.writeFileSync(file, generateRuleFile(id, slug, options));
    out.files.push(file);
    appendRuleConfig({
      id,
      module: kind === 'contract' ? `./contracts/${id}-${slug}` : `./validate/rules/${id}-${slug}`,
      severity: options.severity || 'warning',
      enabled: options.enabled !== false,
      description: options.description || slug,
    });
    out.configUpdated = true;
  } else if (kind === 'eslint') {
    const pluginFile = path.join(SKILL_ROOT, 'eslint', 'plugin.js');
    const snippet = generateEslintRule(idOrSlug, options);
    fs.appendFileSync(pluginFile, snippet);
    out.files.push(pluginFile);

    const severity = options.severity || 'error';
    upsertCardConfigRule(idOrSlug, severity);
    out.configUpdated = true;

    if (options.withTest) {
      out.files.push(appendEslintTest(idOrSlug, options));
    }
  } else if (kind === 'test') {
    const m = idOrSlug.match(/^(V\d+)-([a-z0-9-]+)$/i);
    if (!m) throw new Error('测试 id 应为 V{n}-{slug} 形式');
    const [, id, slug] = m;
    out.files.push(appendValidateTest(id, slug, options));
  } else {
    throw new Error(`未知 scaffold kind: ${kind}（rule | eslint | contract | test）`);
  }
  return out;
}

module.exports = {
  scaffold,
  generateRuleFile,
  generateEslintRule,
  generateValidateTest,
  generateEslintTest,
  appendRuleConfig,
  upsertCardConfigRule,
};
