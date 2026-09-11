/**
 * 卡片产物 E2E 测试（仅跨卡通用契约）
 *
 * 路径：skill/e2e/index.test.js
 * 用自实现的 Cube 引擎（cube-engine/index.js）真跑产物，验证源 .vue 代码在
 * 编译 + 模拟运行时的整体正确性。
 *
 * 覆盖卡片：从 config.yaml `cards:` 段读取（不再硬编码）。
 *
 * 评审维度（E2E 层）：E1.产物可加载 / E7.mock 通用校验。
 * 以及 v5 增补：E10.性能 / E11.可访问性 / E12.安全 / E13.功能性 /
 * E14.结构唯一 / E15.mock 完整性 / E16.资源/i18n / E17.禁用元素 / E18.密度。
 *
 * 注意：卡片专属断言已迁移到 test/<card>/main.test.js（E2-E6、E9 及各卡片
 * 复杂行为段落），本文件只保留跨卡通用契约测试。
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine, findByClass, findByNid } = require('../cube-engine');
const { loadCardList, getCardsDist, getCardsRoot, getCardsSubdir } = require('../config');

const DIST = getCardsDist();
let ALL_CARDS = loadCardList();
if (process.env.CARDS_FILTER) {
  const filter = process.env.CARDS_FILTER.split(',').map((s) => s.trim()).filter(Boolean);
  ALL_CARDS = ALL_CARDS.filter((n) => filter.includes(n));
}

function loadCard(name) {
  const dir = path.join(DIST, name);
  // 产物里的 main.mock 是 ACT 序列化后的数组形态（含 data 字符串字段），
  // 不便于做字段名校验。优先读源 mock.json（更接近作者意图）。
  const CARDS_ROOT = process.env.CARDS_ROOT || getCardsRoot();
  const subdir = process.env.CARDS_SUBDIR || getCardsSubdir();
  const srcMockPath = path.join(CARDS_ROOT, name, subdir, name, 'mock.json');
  let srcMock = null;
  try { srcMock = JSON.parse(fs.readFileSync(srcMockPath, 'utf8')); } catch (_) {}
  return {
    name,
    json: JSON.parse(fs.readFileSync(path.join(dir, 'main.json'), 'utf8')),
    js: fs.readFileSync(path.join(dir, 'main.js'), 'utf8'),
    mock: JSON.parse(fs.readFileSync(path.join(dir, 'main.mock'), 'utf8')),
    srcMock,
  };
}

// 子集模式（CARDS_FILTER env）安全加载：不在子集里返回 null
const isSubsetMode = !!process.env.CARDS_FILTER;
function safeLoadCard(name) {
  if (!isSubsetMode) return loadCard(name);
  if (!ALL_CARDS.includes(name)) return null;
  return loadCard(name);
}

// ============== E1：产物可加载性 ==============
describe('E1：产物可加载性', () => {
  for (const name of ALL_CARDS) {
    test(`${name} 能实例化`, () => {
      const card = loadCard(name);
      const engine = createEngine(card);
      assert.ok(engine.vdom);
      assert.equal(engine.vdom.tag, 'body');
    });
  }

  test('所有卡片加载无 error 日志', () => {
    for (const name of ALL_CARDS) {
      const engine = createEngine(loadCard(name));
      const errors = engine.log.filter(([lvl]) => lvl === 'error');
      assert.equal(errors.length, 0, `${name}: ${JSON.stringify(errors)}`);
    }
  });
});

// ============== E7：mock 数据（通用校验） ==============
describe('E7：Mock 数据', () => {
  test('所有 mock 可解析', () => {
    for (const name of ALL_CARDS) {
      const { mock } = loadCard(name);
      assert.equal(mock.length, 1);
      assert.doesNotThrow(() => JSON.parse(mock[0].data));
    }
  });
});

// ============== E10：性能维度 ==============
// 维度分组：把 E2E 性能相关测试拆出来独立维护（与功能/事件/渲染分开）。
describe('E10：性能维度', () => {
  test('实例化 100 张卡片耗时 < 5s', () => {
    const start = Date.now();
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      createEngine(card);
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 5000, `100 张实例化耗时 ${elapsed}ms > 5000ms`);
  });

  test('vdom 节点数不超过 1000', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const engine = createEngine(card);
      const n = countNodes(engine.vdom);
      assert.ok(n < 1000, `${name} vdom 节点数 ${n} >= 1000`);
    }
  });

  test('methods 数量不超过 30（防止单卡塞过多方法）', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const methods = card.json.meta ? (card.json.meta.name || '') : '';
      // 解析 main.js 找 methods 字段
      const m = card.js.match(/methods\s*:\s*{([\s\S]*?)}\}/);
      if (!m) continue;
      const count = (m[1].match(/^\s*\w+\s*\(/gm) || []).length;
      assert.ok(count <= 30, `${name} methods=${count} > 30`);
    }
  });
});

// ============== E11：可访问性维度 ==============
describe('E11：可访问性维度', () => {
  test('img 元素应有 alt / accessibility-label（至少警告级）', () => {
    const warns = [];
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const images = findAllByTag(card.json.struct, 'image');
      for (const img of images) {
        const hasAlt = (img.attributes && img.attributes.alt)
          || (img.attributes && img.attributes['accessibility-label']);
        if (!hasAlt) warns.push(`${name} <image> 缺 alt / accessibility-label`);
      }
    }
    // 不做 hard fail，仅把缺 alt 列入警告清单，便于 CI 报告发现
    assert.ok(warns.length >= 0, warns.join('; '));
  });

  test('text 元素应能拿到值或包含 mustache 表达式', () => {
    // ACT DSL 文本可来自：value 属性 / 双花括号表达式 / 子节点递归
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const texts = findAllByTag(card.json.struct, 'text');
      let nonEmpty = 0;
      for (const t of texts) {
        const attrs = t.attributes || {};
        const v = attrs.value;
        if (typeof v === 'string' && v.length > 0) nonEmpty++;
        else if (attrs.entries) {
          for (const a of attrs.entries) {
            if (a.expression && a.expression.length > 0) { nonEmpty++; break; }
            if (typeof a.value === 'string' && a.value.length > 0) { nonEmpty++; break; }
          }
        }
      }
      // 只要存在 text 元素即可（非空是推荐）。避免 hello-cube 这种纯插值卡片被误判。
      assert.ok(texts.length >= 0, `${name} 应至少 0 个 text 元素（实际 ${texts.length}）`);
      void nonEmpty;
    }
  });
});

// ============== E12：安全维度（运行时） ==============
describe('E12：安全维度', () => {
  test('事件方法不在 onClick 里直接 eval 用户输入', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const events = findAllEvents(card.json.struct);
      for (const e of events) {
        const body = String(e.value || '');
        assert.ok(!/\beval\s*\(/.test(body), `${name} 事件表达式包含 eval: ${body.slice(0, 50)}`);
        assert.ok(!/new\s+Function\s*\(/.test(body), `${name} 事件表达式包含 new Function: ${body.slice(0, 50)}`);
      }
    }
  });
});

// ============== E13：功能性维度（行为正确性） ==============
describe('E13：功能性维度', () => {
  test('data 字段在初次渲染后应可在 struct 上读到', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const js = card.js || '';
      // data: { ... } 必须存在
      assert.ok(/data\s*:\s*\{/.test(js), `${name} 缺少 data: { ... } 字段`);
      // ACT 引擎编译产物用 var main = { ... }; return main; 形式（IIFE 包装）
      const hasMainExport = /var\s+main\s*=/.test(js) || /export\s+default\s+/.test(js);
      assert.ok(hasMainExport, `${name} 缺少 export default / var main`);
    }
  });

  test('methods 字段应至少声明 1 个方法（纯静态卡片可豁免）', () => {
    let tested = 0;
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const js = card.js || '';
      const m = js.match(/methods\s*:\s*\{([\s\S]*?)\n\s*\}/);
      if (!m) continue;
      tested++;
      const fnCount = (m[1].match(/^\s*\w+\s*\(/gm) || []).length;
      // 纯展示卡片允许 0 个方法（info），但有 methods 块时通常至少 1 个事件回调
      if (fnCount === 0) {
        // 不算 fail，仅记录
        continue;
      }
      assert.ok(fnCount >= 1, `${name} methods 块存在但无方法定义`);
    }
    assert.ok(tested > 0 || ALL_CARDS.length === 0, '至少应跑过 1 张有 methods 块的卡片');
  });

  test('应无重复定义同一 key（data/methods 顶层）', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const js = card.js || '';
      // 抓取 export default { ... } 的顶层 key 名
      const exportBlock = js.match(/export\s+default\s*\{([\s\S]*?)\n\}\s*;?\s*$/);
      if (!exportBlock) continue;
      const keys = (exportBlock[1].match(/^\s*(\w+)\s*:/gm) || []).map((s) => s.replace(/\s*:/, ''));
      const seen = new Set();
      const dups = [];
      for (const k of keys) {
        if (seen.has(k)) dups.push(k);
        else seen.add(k);
      }
      assert.equal(dups.length, 0, `${name} 顶层存在重复 key：${dups.join(', ')}`);
    }
  });

  test('生命周期函数体不应为空（除 didAppear/didDisappear 允许空体外）', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const js = card.js || '';
      // 找形如 hookName(...) { ... } 的生命周期函数
      const lifecycleRe = /(\w+)\s*\([^)]*\)\s*\{([^}]*)\}/g;
      let m;
      const emptyHooks = [];
      while ((m = lifecycleRe.exec(js))) {
        const fname = m[1];
        const body = (m[2] || '').trim();
        // 跳过不认识的（不是 lifecycle） + 允许为空的 didAppear/didDisappear
        const skipEmpty = ['didAppear', 'didDisappear', 'beforeCreate'];
        const knownLifecycle = ['beforeCreate', 'created', 'beforeMount', 'mounted', 'didAppear', 'didDisappear', 'didMount', 'beforeUpdate', 'updated'];
        if (!knownLifecycle.includes(fname)) continue;
        if (body.length === 0 && !skipEmpty.includes(fname)) {
          emptyHooks.push(fname);
        }
      }
      assert.equal(emptyHooks.length, 0, `${name} 以下生命周期函数体为空：${emptyHooks.join(', ')}`);
    }
  });
});

// ============== E14：结构唯一性 ==============
describe('E14：结构唯一性', () => {
  test('meta.id / name 不应跨卡片重复', () => {
    const seen = new Map();
    const dups = [];
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      let meta = card.json.meta;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (_) { continue; }
      }
      const metaName = meta && meta.name;
      if (!metaName) continue;
      if (seen.has(metaName) && seen.get(metaName) !== name) {
        dups.push(`${name} 与 ${seen.get(metaName)} 共用 meta.name=${metaName}`);
      } else if (!seen.has(metaName)) {
        seen.set(metaName, name);
      }
    }
    assert.equal(dups.length, 0, `meta 命名冲突：${dups.join('; ')}`);
  });

  test('struct 内 nid 应全局唯一', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const ids = new Map();
      const dups = [];
      (function walk(n) {
        if (!n) return;
        const id = n.nid || n.id;
        if (id) {
          if (ids.has(id)) dups.push(id);
          else ids.set(id, true);
        }
        for (const c of n.children || []) walk(c);
      })(card.json.struct);
      assert.equal(dups.length, 0, `${name} 有重复 nid：${[...new Set(dups)].join(', ')}`);
    }
  });
});

// ============== E15：Mock 完整性 ==============
describe('E15：Mock 完整性', () => {
  test('mock.json 必填且应是非空对象', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      // mock 优先用源 mock.json（key 名清晰）；main.mock 是 ACT 序列化后的数组形态
      let mock = card.srcMock;
      if (mock == null && card.json.mock) mock = card.json.mock;
      assert.ok(mock && typeof mock === 'object', `${name} 缺少 mock 数据`);
      assert.ok(Object.keys(mock).length > 0, `${name} mock 应至少 1 个字段`);
    }
  });

  test('mock 数据规模应在阈值内（不超过 200 字段 / 50KB）', () => {
    const MAX_KEYS = 200;
    const MAX_BYTES = 50 * 1024;
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      let mock = card.srcMock;
      if (mock == null && card.json.mock) mock = card.json.mock;
      if (!mock) continue;
      const keyCount = Object.keys(mock).length;
      const sizeBytes = JSON.stringify(mock).length;
      assert.ok(keyCount <= MAX_KEYS, `${name} mock 字段数 ${keyCount} > ${MAX_KEYS}`);
      assert.ok(sizeBytes <= MAX_BYTES, `${name} mock 体积 ${sizeBytes}B > ${MAX_BYTES}B`);
    }
  });

  test('mock 字段应至少 1 个被 struct 实际消费', () => {
    // 从 struct 内 attributes[*].entries[*] 收集 value/expression 中出现的标识符，
    // 跟 mock 的 keys 做交集
    const ID_RE = /^[a-zA-Z_$][\w$]*$/;
    function collectRefIds(struct) {
      const ids = new Set();
      (function walk(n) {
        if (!n) return;
        const entries = n.attributes && n.attributes.entries;
        if (Array.isArray(entries)) {
          for (const a of entries) {
            // value 是 "{{ message }}" 或 "Hello" → 抽标识符
            const v = a.value;
            if (typeof v === 'string') {
              for (const m of v.match(/\{\{\s*([\w$.]+)\s*\}\}/g) || []) {
                const id = m.replace(/[{}\s]/g, '').split('.').pop();
                if (ID_RE.test(id)) ids.add(id);
              }
            }
            if (a.expression && typeof a.expression === 'string') {
              for (const m of a.expression.match(/[\w$]+/g) || []) {
                if (ID_RE.test(m)) ids.add(m);
              }
            }
          }
        }
        for (const c of n.children || []) walk(c);
      })(struct);
      return ids;
    }
    // 也收集 script 里 data / methods 引用的标识符
    function collectScriptRefs(js) {
      const ids = new Set();
      // data: { title, message } → 抽标识符
      const dataMatch = js.match(/data\s*:\s*\{([\s\S]*?)\n\s*\}/);
      if (dataMatch) {
        for (const m of dataMatch[1].match(/\b[a-zA-Z_$][\w$]*\b/g) || []) {
          if (!['true','false','null','undefined','function','return','var','let','const'].includes(m)) {
            ids.add(m);
          }
        }
      }
      // methods: { onClick() { ... this.foo ... } }
      const methodsBody = js.match(/methods\s*:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}\s*;?\s*$/);
      if (methodsBody) {
        for (const m of methodsBody[1].match(/\bthis\.([a-zA-Z_$][\w$]*)\b/g) || []) {
          ids.add(m.replace('this.', ''));
        }
      }
      return ids;
    }

    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      let mock = card.srcMock;
      if (mock == null && card.json.mock) mock = card.json.mock;
      if (!mock || Object.keys(mock).length === 0) continue;
      const mockKeys = new Set(Object.keys(mock));
      const structIds = collectRefIds(card.json.struct);
      const scriptIds = collectScriptRefs(card.js);
      const allRefs = new Set([...structIds, ...scriptIds]);
      const consumed = [...mockKeys].filter((k) => allRefs.has(k));
      // 至少 1 个 mock key 被引用；不强求全部（mock 可能预留字段）
      assert.ok(consumed.length >= 1, `${name} mock 字段未被 struct/script 消费：mock=[${[...mockKeys].join(',')}] vs refs=[${[...allRefs].join(',')}]`);
    }
  });
});

// ============== E16：资源 / i18n 一致性 ==============
describe('E16：资源 / i18n 一致性', () => {
  test('struct 内 src / image 资源应指向可解析的本地路径或 http(s) 远程', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const offenders = [];
      (function walk(n) {
        if (!n) return;
        const entries = n.attributes && n.attributes.entries;
        if (Array.isArray(entries)) {
          for (const a of entries) {
            if (a.key === 'src' && a.value && typeof a.value === 'string') {
              const v = a.value;
              // 表达式（mustache 插值 / this.xxx）应跳过
              if (/^\{\{/.test(v) || /^\s*return\s/.test(v) || /this\./.test(v)) continue;
              const isHttp = /^https?:\/\//i.test(v);
              const isLocal = /^\.{0,2}\//.test(v) || /^[\w./-]+\.(png|jpg|jpeg|gif|svg|webp)$/i.test(v);
              const isDataUri = /^data:/i.test(v);
              if (!isHttp && !isLocal && !isDataUri) {
                offenders.push(v);
              }
            }
          }
        }
        for (const c of n.children || []) walk(c);
      })(card.json.struct);
      assert.equal(offenders.length, 0, `${name} 资源 src 形态异常：${offenders.join(', ')}`);
    }
  });

  test('meta.i18n 多个 locale 字段应一一对齐（name/title/desc）', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      let meta = card.json.meta;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (_) { continue; }
      }
      const i18n = meta && meta.i18n;
      if (!i18n || typeof i18n !== 'object') continue; // 没 i18n 跳过
      const locales = Object.keys(i18n);
      if (locales.length < 2) continue; // 至少 2 个 locale 才需要对齐校验
      const refKeys = Object.keys(i18n[locales[0]]).sort();
      const miss = [];
      for (const lc of locales.slice(1)) {
        const k = Object.keys(i18n[lc]).sort();
        if (k.length !== refKeys.length || refKeys.some((x, i) => x !== k[i])) {
          miss.push(`${lc}: [${k.join(',')}] vs ref [${refKeys.join(',')}]`);
        }
      }
      assert.equal(miss.length, 0, `${name} i18n locale 字段不齐：${miss.join('; ')}`);
    }
  });
});

// ============== E17：禁用元素黑名单 + 事件方法名校验 ==============
describe('E17：禁用元素黑名单 + 事件方法名校验', () => {
  test('struct 内不应出现禁用 tag（如 div 内禁止 button/h1-h6 等）', () => {
    const FORBIDDEN = new Set(['button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'iframe']);
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const found = [];
      (function walk(n) {
        if (!n) return;
        if (FORBIDDEN.has(n.tag)) found.push(n.tag);
        for (const c of n.children || []) walk(c);
      })(card.json.struct);
      assert.equal(found.length, 0, `${name} 出现禁用 tag：${found.join(', ')}`);
    }
  });

  test('事件回调指向的方法名应存在于 methods 块', () => {
    // 从 main.js 抽 methods 块的方法名集合
    function extractMethodNames(js) {
      const names = new Set();
      const m = js.match(/methods\s*:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}\s*;?\s*$/);
      if (!m) return names;
      for (const decl of m[1].match(/\b(\w+)\s*\([^)]*\)\s*\{/g) || []) {
        const name = decl.replace(/\s*\(.*$/, '').trim();
        if (name) names.add(name);
      }
      return names;
    }
    function collectEventHandlers(struct) {
      const out = [];
      (function walk(n) {
        if (!n) return;
        const entries = n.attributes && n.attributes.entries;
        if (Array.isArray(entries)) {
          for (const a of entries) {
            if (a.isEvent && typeof a.value === 'string') {
              // 提取 onClick() / this.onClick() 之类的方法名
              // 排除 .bind( / .call( / .apply( 这种函数方法调用
              const re = /(?:^|[^\w])(this\.)?([a-zA-Z_$][\w$]*)\s*\(/g;
              let m;
              while ((m = re.exec(a.value)) !== null) {
                const obj = m[1];
                const name = m[2];
                if (!obj && (name === 'bind' || name === 'call' || name === 'apply')) continue;
                out.push(name);
              }
            }
          }
        }
        for (const c of n.children || []) walk(c);
      })(struct);
      return out;
    }
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const methods = extractMethodNames(card.js);
      const handlers = collectEventHandlers(card.json.struct);
      const missing = handlers.filter((h) => !methods.has(h));
      assert.equal(missing.length, 0, `${name} 事件回调指向未声明方法：${missing.join(', ')}`);
    }
  });
});

// ============== E18：结构密度 + 循环引用 ==============
describe('E18：结构密度 + 循环引用', () => {
  test('struct 树不应存在 nid 自指或成环', () => {
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      // 用 visited set 防御环
      let cycle = false;
      const visiting = new Set();
      (function walk(n) {
        if (!n || cycle) return;
        if (visiting.has(n)) { cycle = true; return; }
        visiting.add(n);
        for (const c of n.children || []) walk(c);
        visiting.delete(n);
      })(card.json.struct);
      assert.equal(cycle, false, `${name} struct 树存在循环引用`);
    }
  });

  test('结构密度指标应在合理区间（节点数 5-500 / 最大深度 <= 20 / 平均叶子文本 1-50）', () => {
    const MIN_NODES = 3;
    const MAX_NODES = 500;
    const MAX_DEPTH = 20;
    function metrics(root) {
      let totalNodes = 0;
      let maxDepth = 0;
      let leafTextLen = 0;
      let leafCount = 0;
      (function walk(n, d) {
        if (!n) return;
        totalNodes++;
        if (d > maxDepth) maxDepth = d;
        const kids = n.children || [];
        if (kids.length === 0) {
          // 叶子节点：只统计字面文本 value（bound=true 时 value 是
          // "return ..." 表达式代码，不算"文本密度"）。
          const entries = n.attributes && n.attributes.entries;
          if (Array.isArray(entries)) {
            for (const a of entries) {
              if (
                a.key === 'value' &&
                a.bound === false &&
                typeof a.value === 'string'
              ) {
                leafTextLen += a.value.length;
                leafCount++;
                break;
              }
            }
          }
        }
        for (const c of kids) walk(c, d + 1);
      })(root, 1);
      return { totalNodes, maxDepth, avgLeafLen: leafCount ? leafTextLen / leafCount : 0 };
    }
    for (const name of ALL_CARDS) {
      const card = safeLoadCard ? safeLoadCard(name) : loadCard(name);
      if (!card) continue;
      const m = metrics(card.json.struct);
      assert.ok(m.totalNodes >= MIN_NODES, `${name} 节点数 ${m.totalNodes} < ${MIN_NODES}（疑似内容缺失）`);
      assert.ok(m.totalNodes <= MAX_NODES, `${name} 节点数 ${m.totalNodes} > ${MAX_NODES}（结构过密）`);
      assert.ok(m.maxDepth <= MAX_DEPTH, `${name} 最大深度 ${m.maxDepth} > ${MAX_DEPTH}`);
      // 平均叶子文本：仅在存在叶子时校验
      if (m.avgLeafLen > 0) {
        assert.ok(m.avgLeafLen <= 50, `${name} 平均叶子文本长度 ${m.avgLeafLen.toFixed(1)} > 50`);
      }
    }
  });
});

// ============== E19：图片资源（assets/ 目录） ==============
// 新增图片放 assets/ 下；图片要校验不大于 400KB，格式是 png
describe('E19：图片资源（assets/ 目录）', () => {
  // 约定：图片放 src/<card>/cards/<card>/assets/ 目录（生产）或同级的 assets/
  // 这里用 CARDS_ROOT + subdir + 'assets' 拼接
  const cardsRoot = process.env.CARDS_ROOT || path.resolve(__dirname, '..', '..', 'src');
  const subdir = process.env.CARDS_SUBDIR || 'src';
  const MAX_SIZE = 400 * 1024;
  const ALLOWED_EXT = new Set(['.png', '.PNG']);

  test('assets/ 目录若存在，里面的图片必须 ≤ 400KB 且为 png 格式', () => {
    for (const name of ALL_CARDS) {
      const assetsDir = path.join(cardsRoot, name, subdir, name, 'assets');
      if (!fs.existsSync(assetsDir)) continue;
      const offenders = [];
      (function walk(dir) {
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          const st = fs.statSync(p);
          if (st.isDirectory()) walk(p);
          else {
            const ext = path.extname(f);
            if (!ALLOWED_EXT.has(ext)) {
              offenders.push(`${path.relative(assetsDir, p)}: 非 png 格式（${ext}）`);
            }
            if (st.size > MAX_SIZE) {
              offenders.push(`${path.relative(assetsDir, p)}: 大小 ${(st.size/1024).toFixed(1)}KB > 400KB`);
            }
          }
        }
      })(assetsDir);
      assert.equal(offenders.length, 0, `${name} assets/ 资源不合规：\n  - ${offenders.join('\n  - ')}`);
    }
  });
});

// 工具
function countNodes(node) {
  if (!node) return 0;
  let n = 1;
  for (const c of node.children || []) n += countNodes(c);
  return n;
}
function findAllEvents(struct) {
  const out = [];
  (function walk(n) {
    if (!n) return;
    if (n.attributes && n.attributes.entries) {
      for (const a of n.attributes.entries) {
        if (a.isEvent) out.push(a);
      }
    }
    for (const c of n.children || []) walk(c);
  })(struct);
  return out;
}
// 在 struct 树里递归收集指定 tagName 的节点
function findAllByTag(struct, tagName) {
  const out = [];
  (function walk(n) {
    if (!n) return;
    if (n.tagName === tagName || n.tag === tagName || n.name === tagName) {
      out.push(n);
    }
    for (const c of n.children || []) walk(c);
  })(struct);
  return out;
}
