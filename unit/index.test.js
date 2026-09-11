/**
 * 卡片产物单元测试
 *
 * 路径：unit/index.test.js
 * 覆盖卡片：从 config.yaml `cards:` 段读取（不再硬编码）。
 * 评审维度（13 维度）：基础（结构/节点/样式/逻辑/表达式/mock/跨卡）、
 * v-if 条件渲染、ES6 getter、动态 class、长列表、mock 合并契约、错误边界。
 *
 * 区别于 e2e/：本层只校验 dist 产物结构（main.json / main.js / main.mock）的
 * 字段完整性、形态正确、跨卡片一致性，不实际"跑"卡片。
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCardList } = require('../config');

const DIST = require('../config').getCardsDist();
let ALL_CARDS = loadCardList();
// 端到端 CLI（cli.js --card）支持只测子集：通过 CARDS_FILTER env 过滤
const isSubsetMode = !!process.env.CARDS_FILTER;
if (isSubsetMode) {
  const filter = process.env.CARDS_FILTER.split(',').map((s) => s.trim()).filter(Boolean);
  ALL_CARDS = ALL_CARDS.filter((n) => filter.includes(n));
}

function loadCard(name) {
  const dir = path.join(DIST, name);
  return {
    name,
    json: JSON.parse(fs.readFileSync(path.join(dir, 'main.json'), 'utf8')),
    js: fs.readFileSync(path.join(dir, 'main.js'), 'utf8'),
    mock: JSON.parse(fs.readFileSync(path.join(dir, 'main.mock'), 'utf8')),
  };
}

/**
 * 子集模式（CARDS_FILTER env 设置）下：
 *   - 不在 ALL_CARDS 的卡片返回 null；调用方需判 null 跳过断言
 *   - 在 ALL_CARDS 的卡片返回 loadCard(name)
 * 全集模式下等同 loadCard(name)，硬编码 loadCard('xxx') 的细粒度断言
 * 不需要任何 guard 改造。
 */
function safeLoadCard(name) {
  if (!isSubsetMode) return loadCard(name);
  if (!ALL_CARDS.includes(name)) return null;
  return loadCard(name);
}

function isInSubset(name) {
  return ALL_CARDS.includes(name);
}

/**
 * 把一个细粒度断言 test 转成"子集模式下跳过"的 test。
 * 用法：test('xxx', safeTest('xxx-card', () => { ... }));
 * 全集模式：等价于普通 test()；子集模式：若卡片不在子集，断言跳过。
 */
function safeTest(name, fn) {
  return () => {
    if (isSubsetMode && !ALL_CARDS.includes(name)) return; // 子集模式：跳过
    return fn();
  };
}

// ============== 工具 ==============
function findAllByTag(node, tag, acc = []) {
  if (node.tag === tag) acc.push(node);
  if (node.children) node.children.forEach((c) => findAllByTag(c, tag, acc));
  return acc;
}

function findByClass(node, cls, acc = []) {
  const attrs = node.attributes?.entries || [];
  const classAttr = attrs.find((a) => a.key === 'class' && !a.bound);
  if (classAttr && (classAttr.value === cls || classAttr.value.split(/\s+/).includes(cls))) {
    acc.push(node);
  }
  if (node.children) node.children.forEach((c) => findByClass(c, cls, acc));
  return acc;
}

function getAttr(node, key, { bound = null } = {}) {
  return node.attributes.entries.find((a) => {
    if (a.key !== key) return false;
    if (bound !== null && a.bound !== bound) return false;
    return true;
  });
}

function getStyle(json, selector) {
  return json.style.entries.find((e) => e.key === selector)?.value?.entries || [];
}

function styleHasProps(json, selector, keys) {
  const entries = getStyle(json, selector).map((e) => e.key);
  return keys.every((k) => entries.includes(k));
}

function styleProp(json, selector, key) {
  return getStyle(json, selector).find((e) => e.key === key);
}

function countVFor(json) {
  let c = 0;
  (function walk(n) {
    if (n.vfor) c++;
    n.children?.forEach(walk);
  })(json.struct);
  return c;
}

function countVIf(json) {
  let c = 0;
  (function walk(n) {
    if (n.vIf) c++;
    n.children?.forEach(walk);
  })(json.struct);
  return c;
}

function countEvents(json) {
  let c = 0;
  (function walk(n) {
    for (const a of n.attributes?.entries || []) if (a.isEvent) c++;
    n.children?.forEach(walk);
  })(json.struct);
  return c;
}

// ============== 维度 1：结构完整性 ==============
describe('维度1：结构完整性', () => {
  for (const cardName of ALL_CARDS) {
    test(`${cardName} 必备字段齐全`, () => {
      const { json } = loadCard(cardName);
      assert.equal(json.compilerType, 1);
      assert.ok(json.compilerVersion);
      assert.ok(json.meta);
      assert.ok(json.struct);
      assert.ok(json.style?.entries);
      assert.ok('medias' in json);
      assert.ok(json.logic);
    });

    test(`${cardName} meta 字段应含 name/version/compilerType`, () => {
      const { json } = loadCard(cardName);
      const meta = JSON.parse(json.meta);
      assert.ok(meta.name);
      assert.ok(meta.version);
      assert.equal(meta.compilerType, 1);
    });
  }
});

// ============== 维度 2：节点准确性 ==============
describe('维度2：节点准确性', () => {
  test('所有卡片根节点应为 body', () => {
    for (const name of ALL_CARDS) {
      const { json } = loadCard(name);
      assert.equal(json.struct.tag, 'body', `${name} 根应为 body`);
    }
  });

  test('class 属性应原样保留（非 bound）', () => {
    for (const name of ALL_CARDS) {
      const { json } = loadCard(name);
      const root = json.struct.children[0];
      const cls = getAttr(root, 'class');
      assert.ok(cls, `${name} 根 div 应有 class`);
      assert.equal(cls.bound, false);
    }
  });

  test('@click 应翻译为 isEvent + bind 表达式', () => {
    const cardsWithEvents = ['hello-cube', 'counter', 'product-card', 'switches-panel', 'todo-app'];
    for (const name of cardsWithEvents) {
      const { json } = loadCard(name);
      let found = 0;
      (function walk(n) {
        for (const a of n.attributes?.entries || []) {
          if (a.isEvent) {
            assert.match(a.value, /\.bind\(this/, `${name} 事件应含 bind(this...)`);
            found++;
          }
        }
        n.children?.forEach(walk);
      })(json.struct);
      assert.ok(found > 0, `${name} 至少应有 1 个事件`);
    }
  });

  test('counter 应有 3 个独立事件', () => {
    // 已迁移至 test/counter/main.test.js
  });
  test('product-card 应有 3 个独立事件', () => {
    // 已迁移至 test/product-card/main.test.js
  });
  test('switches-panel 应有 2 个事件 (tab + increment)', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('todo-app 应有 7 个事件（1 add + 3 filter + 2 item-toggle + 1 item-del）', () => {
    // 已迁移至 test/todo-app/main.test.js
  });

  test('image 标签应在 user-profile / product-card 中存在', () => {
    for (const name of ['user-profile', 'product-card']) {
      const card = safeLoadCard(name);
      if (!card) continue;
      const images = findAllByTag(card.json.struct, 'image');
      assert.ok(images.length >= 1, `${name} 应有 image`);
    }
  });

  test('v-for 节点应翻译成 vfor 描述符', () => {
    for (const name of ['feed-list', 'tag-list', 'chart-bar']) {
      assert.ok(countVFor(loadCard(name).json) >= 1, `${name} 应有 v-for`);
    }
  });

  test('v-for 描述符应包含 item/index/items 字段', () => {
    // 已迁移至 test/tag-list/main.test.js
  });

  test('chart-bar 内 bar 节点应至少 3 个子节点（label/track/value）', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });
});

// ============== 维度 3：样式准确性 ==============
describe('维度3：样式准确性', () => {
  test('所有 .xx 选择器都应出现在 style.entries', () => {
    for (const name of ALL_CARDS) {
      const { json } = loadCard(name);
      const keys = json.style.entries.map((e) => e.key);
      assert.ok(keys.length > 0, `${name} 应至少 1 个选择器`);
      keys.forEach((k) => assert.match(k, /^\./, `${name}: ${k} 应以 . 开头`));
    }
  });

  test('kebab-case 属性应转驼峰', () => {
    for (const name of ALL_CARDS) {
      const { json } = loadCard(name);
      let hasCamel = false;
      for (const entry of json.style.entries) {
        for (const prop of entry.value.entries) {
          if (/[A-Z]/.test(prop.key)) hasCamel = true;
        }
      }
      assert.ok(hasCamel, `${name} 应至少有 1 个驼峰属性`);
    }
  });

  test('rpx 单位应原样保留', () => {
    for (const name of ALL_CARDS) {
      const { json } = loadCard(name);
      let hasRpx = false;
      for (const entry of json.style.entries) {
        for (const e of entry.value.entries) {
          if (typeof e.value === 'string' && e.value.includes('rpx')) hasRpx = true;
        }
      }
      assert.ok(hasRpx, `${name} 应至少 1 个 rpx 值`);
    }
  });

  test('百分号 / hex 颜色应原样保留', () => {
    // 已迁移至 test/hello-cube/main.test.js
  });

  test('counter 背景色（多 class）', () => {
    // 已迁移至 test/counter/main.test.js
  });

  test('borderRadius / border 处理', () => {
    // 已迁移至 test/product-card/main.test.js
  });

  test('flex-wrap 转换', () => {
    // 已迁移至 test/tag-list/main.test.js
  });
});

// ============== 维度 4：逻辑准确性 ==============
describe('维度4：逻辑准确性', () => {
  for (const name of ALL_CARDS) {
    test(`${name} IIFE/ES5/零依赖`, () => {
      const { js } = loadCard(name);
      assert.match(js, /^\(function\s*\(\s*\)\s*\{/);
      assert.match(js, /'use strict';/);
      assert.match(js, /\}\)\(\);?\s*$/);
      assert.doesNotMatch(js, /\brequire\(/);
      assert.doesNotMatch(js, /\bimport\s+/);
    });
  }

  test('hello-cube 钩子', () => {
    // 已迁移至 test/hello-cube/main.test.js
  });

  test('counter 3 方法 + didMount', () => {
    // 已迁移至 test/counter/main.test.js
  });

  test('product-card onCardClick/onLike/onShare', () => {
    // 已迁移至 test/product-card/main.test.js
  });

  test('tag-list data.tags 应为数组', () => {
    // 已迁移至 test/tag-list/main.test.js
  });

  test('logic 字段与 main.js 一致', () => {
    for (const name of ALL_CARDS) {
      const { json, js } = loadCard(name);
      assert.equal(json.logic.trim(), js.trim());
    }
  });
});

// ============== 维度 5：表达式求值 ==============
describe('维度5：表达式求值', () => {
  test('简单 :value 应翻译成 return this.xxx', () => {
    // 已迁移至 test/hello-cube/main.test.js
  });

  test('字符串拼接 :value 应保留拼接', () => {
    // 已迁移至 test/product-card/main.test.js
  });

  test('三元表达式应原样保留', () => {
    // 已迁移至 test/product-card/main.test.js
  });

  test('counter 多次事件应有独立方法名', () => {
    // 已迁移至 test/counter/main.test.js
  });

  test('@click 翻译：this.xxx.bind(this) 模式', () => {
    // 已迁移至 test/counter/main.test.js
  });

  test('复杂表达式：v-for 内 this.item.value 与字符串拼接', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });

  test('动态 style 表达式（chart-bar bar-fill 宽度）', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });
});

// ============== 维度 6：Mock 数据完整性 ==============
describe('维度6：Mock 数据完整性', () => {
  test('所有 mock 都能解析为数组 + data 字符串', () => {
    for (const name of ALL_CARDS) {
      const { mock } = loadCard(name);
      assert.ok(Array.isArray(mock));
      assert.equal(mock.length, 1);
      assert.ok(typeof mock[0].data === 'string');
      assert.doesNotThrow(() => JSON.parse(mock[0].data));
    }
  });

  test('各卡 mock 关键字段（通用形态校验）', () => {
    // 不再断言具体字符串/数字；
    // 只断言每张卡片的 mock.data 能解析为合法 JSON，且至少含 1 个字段。
    for (const name of ALL_CARDS) {
      const mock = loadCard(name).mock;
      assert.ok(Array.isArray(mock), `${name}: mock 应该是数组`);
      assert.ok(mock.length > 0, `${name}: mock 至少 1 条`);
      assert.ok(typeof mock[0].data === 'string', `${name}: mock[0].data 是字符串`);
      const obj = JSON.parse(mock[0].data);
      assert.ok(obj && typeof obj === 'object', `${name}: mock.data 是合法 JSON 对象`);
      assert.ok(Object.keys(obj).length > 0, `${name}: mock.data 至少含 1 个字段`);
    }
  });
});

// ============== 维度 7：跨卡片一致性 ==============
describe('维度7：跨卡片一致性', () => {
  test('compilerType 一致', () => {
    const types = new Set();
    for (const name of ALL_CARDS) types.add(loadCard(name).json.compilerType);
    assert.equal(types.size, 1);
  });
  test('compilerVersion 一致', () => {
    const versions = new Set();
    for (const name of ALL_CARDS) versions.add(loadCard(name).json.compilerVersion);
    assert.equal(versions.size, 1);
  });
  test('都包含 medias 字段', () => {
    for (const name of ALL_CARDS) assert.ok('medias' in loadCard(name).json);
  });
  test('产物大小 < 50KB', () => {
    for (const name of ALL_CARDS) {
      const { json, js } = loadCard(name);
      const totalSize = JSON.stringify(json).length + js.length;
      assert.ok(totalSize < 50 * 1024, `${name} 过大: ${totalSize}`);
    }
  });
  test('所有 JS 都 return main', () => {
    for (const name of ALL_CARDS) {
      assert.match(loadCard(name).js, /return main;/, `${name} 应 return main`);
    }
  });
});

// ============== 维度 8：v-if 条件渲染 ==============
describe('维度8：v-if 条件渲染', () => {
  test('switches-panel 应有 5 个 vIf（4 panel + 1 empty）', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('search-list 应有 2 个 vIf（hint + empty）', () => {
    // 已迁移至 test/search-list/main.test.js
  });
  test('todo-app 应有 1 个 vIf（empty）', () => {
    // 已迁移至 test/todo-app/main.test.js
  });
  test('v-if 表达式应为 return this.xxx 形式', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('switches-panel vIf 引用 this.tab 与 isValidTab', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('无 v-if 的卡片不应有 vIf 字段', () => {
    // 已迁移至各卡片 test/\u003ccard\u003e/main.test.js（hello-cube / user-profile / feed-list / counter / product-card / tag-list / chart-bar）
  });
});

// ============== 维度 9：ES6 getter ==============
describe('维度9：计算属性（getter）', () => {
  function countGetters(js) {
    return (js.match(/^\s*get\s+\w+\s*\(/gm) || []).length;
  }
  test('search-list 应有 2 个 getter', () => {
    // 已迁移至 test/search-list/main.test.js
  });
  test('todo-app 应有 6 个 getter', () => {
    // 已迁移至 test/todo-app/main.test.js
  });
  test('chart-bar 应有 3 个 getter', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });
  test('getter 体内 this.xxx 引用', () => {
    // 已迁移至 test/search-list/main.test.js
  });
  test('getter 应保留为 ES6 语法（未 ES5 化）', () => {
    // 已迁移至 test/search-list/main.test.js
  });
});

// ============== 维度 10：动态 class / 跨选择器 ==============
describe('维度10：动态 class', () => {
  test('switches-panel 根 div 同时有静态 + 动态 class', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('动态 class 表达式为三元', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('switches-panel 跨选择器样式应保留', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
  test('product-card 双 class（panel error）', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
});

// ============== 维度 11：长列表 / 数据规模 ==============
describe('维度11：长列表性能', () => {
  test('chart-bar v-for 引用 this.bars', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });
  test('chart-bar 多层嵌套 bar 内节点', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });
});

// ============== 维度 12：mock data 合并契约 ==============
describe('维度12：mock data 合并契约', () => {
  test('mock 数组结构', () => {
    for (const name of ALL_CARDS) {
      const { mock } = loadCard(name);
      assert.ok(Array.isArray(mock));
      assert.ok(mock[0].data);
    }
  });
  test('mock.data 可被 JSON.parse', () => {
    for (const name of ALL_CARDS) {
      const { mock } = loadCard(name);
      assert.doesNotThrow(() => JSON.parse(mock[0].data));
    }
  });
  test('chart-bar mock 字段', () => {
    // 已迁移至 test/chart-bar/main.test.js
  });
  test('switches-panel mock 字段含 theme/tab/counter', () => {
    // 已迁移至 test/switches-panel/main.test.js
  });
});

// ============== 维度 13：错误处理 / 边界 ==============
describe('维度13：错误处理与边界', () => {
  test('所有卡片 main.json 可独立 JSON.parse（无 NaN/Infinity 等）', () => {
    for (const name of ALL_CARDS) {
      const dir = path.join(DIST, name);
      const raw = fs.readFileSync(path.join(dir, 'main.json'), 'utf8');
      assert.doesNotThrow(() => JSON.parse(raw));
    }
  });

  test('所有 main.js 不应含 require / import / eval', () => {
    for (const name of ALL_CARDS) {
      const { js } = loadCard(name);
      assert.doesNotMatch(js, /\brequire\(/, `${name} 不应含 require`);
      assert.doesNotMatch(js, /\bimport\s/, `${name} 不应含 import`);
      assert.doesNotMatch(js, /\beval\(/, `${name} 不应含 eval`);
    }
  });

  test('所有 vdom 根 tag 应为 body', () => {
    for (const name of ALL_CARDS) {
      assert.equal(loadCard(name).json.struct.tag, 'body');
    }
  });

  test('所有 v-for / v-if 表达式字段不应为空字符串', () => {
    for (const name of ALL_CARDS) {
      const { json } = loadCard(name);
      (function walk(n) {
        if (n.vfor) assert.ok(n.vfor.items);
        if (n.vif !== undefined) assert.ok(typeof n.vif === 'string');
        if (n.vIf !== undefined) assert.ok(typeof n.vIf === 'string');
        n.children?.forEach(walk);
      })(json.struct);
    }
  });
});
