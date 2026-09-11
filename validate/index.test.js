/**
 * validate 单元测试
 *
 * 路径：validate/index.test.js
 * 目标：验证 ACT DSL 静态校验器（validate/index.js）的正确性。
 *   - 正向：从 config.yaml 读取的卡片应通过（errors=0）
 *   - 反向：故意制造错误应被规则命中
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCard, validateAll, summarize } = require('./index.js');
const { loadCardList, getCardsRoot, getCardsSubdir } = require('../config');

const CARDS_DIR = getCardsRoot();
const CARDS_SUBDIR = process.env.CARDS_SUBDIR || getCardsSubdir();
let ALL_CARDS = loadCardList();
if (process.env.CARDS_FILTER) {
  const filter = process.env.CARDS_FILTER.split(',').map((s) => s.trim()).filter(Boolean);
  ALL_CARDS = ALL_CARDS.filter((n) => filter.includes(n));
}

describe('正向：所有已登记卡片应通过校验', () => {
  for (const name of ALL_CARDS) {
    test(`${name} 校验无 error`, () => {
      const cardPath = path.join(CARDS_DIR, name, CARDS_SUBDIR, name);
      const r = validateCard(cardPath);
      assert.equal(r.errors.length, 0, `${name} 不应有 error: ${JSON.stringify(r.errors)}`);
    });
  }

  test('汇总应能区分 pass/fail', () => {
    const all = validateAll(CARDS_DIR, { sourceSubdir: CARDS_SUBDIR, cards: ALL_CARDS });
    const summary = summarize(all);
    assert.equal(summary.total, ALL_CARDS.length);
    assert.equal(summary.failCount, 0, `无 error 时 failCount 应为 0，实际 ${summary.failCount}`);
    assert.equal(summary.passCount, ALL_CARDS.length);
  });
});

describe('V1: manifest.json 校验', () => {
  test('缺 manifest.json 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(path.join(tmpDir, 'main.vue'), '<template><div></div></template>');
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V1')), '应报 V1 error');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('manifest.json JSON 不合法应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{ not json }');
    fs.writeFileSync(path.join(tmpDir, 'main.vue'), '<template><div></div></template>');
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.includes('解析失败')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('manifest.json 缺 name/version 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'main.vue'), '<template><div></div></template>');
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.includes('name')));
    assert.ok(r.errors.some((e) => e.includes('version')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('manifest compilerType=3 应被 schema 拒绝（error 或 warning）', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1', compilerType: 3 })
    );
    fs.writeFileSync(path.join(tmpDir, 'main.vue'), '<template><div></div></template>');
    const r = validateCard(tmpDir);
    const all = [...r.errors, ...r.warnings];
    assert.ok(all.some((m) => m.includes('compilerType')), 'compilerType=3 应被 ajv schema 拒绝');
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V2: 模板标签白名单', () => {
  test('非法标签应被报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div><web-view src="..."></web-view></div></template>
<script>export default { data: {} }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('web-view')), 'web-view 应被报 warning');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法标签（div/text/image）不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <div><text :value="'hi'"></text><image src="..."></image></div>
      </template>
      <script>export default { data: {} }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V2')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V4: 表达式引用合法性', () => {
  test('引用未定义的 data 字段应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="undefinedVar"></text></template>
<script>export default { data: { foo: 1 } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('undefinedVar')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('引用已定义的 data 字段不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="title"></text></template>
<script>export default { data: { title: 'hi' } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V4')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('引用 Math/Date 等全局不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="Math.max(1, 2)"></text></template>
<script>export default { data: {} }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V4')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('v-bind 长写法也应校验表达式引用', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text v-bind:value="undefinedVar"></text></template>
<script>export default { data: { title: 'hi' } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('undefinedVar')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('v-on 长写法也应校验事件方法', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text v-on:click="ghostMethod()"></text></template>
<script>export default { methods: { realMethod() {} } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('ghostMethod')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('属性链中的未定义根引用应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="undefinedVar.real"></text></template>
<script>export default { data: { title: 'hi' } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('undefinedVar')));
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V5: 事件方法存在性', () => {
  test('@click 引用未定义的 method 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text @click="ghostMethod()"></text></template>
<script>export default { methods: { realMethod() {} } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('ghostMethod')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('@click 引用已定义的方法不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text @click="onClick()"></text></template>
<script>export default { methods: { onClick() {} } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V5')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V6: v-for 数据源存在性', () => {
  test('v-for 引用未定义的 data 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <div v-for="item in ghostList"><text :value="item"></text></div>
      </template>
      <script>export default { data: { realList: [] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('ghostList')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('v-for 引用已定义的数据不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <div v-for="item in realList"><text :value="item"></text></div>
      </template>
      <script>export default { data: { realList: [] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V6')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V7: v-if 表达式合法性', () => {
  test('v-if 是赋值表达式应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div v-if="x = 5">x</div></template>
<script>export default { data: { x: 0 } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V7') && e.includes('赋值')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('v-if 是语句序列应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div v-if="x = 1; y = 2">x</div></template>
<script>export default { data: { x: 0, y: 0 } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.includes('语句序列')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('v-if 合法比较表达式不应报错', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <div v-if="showHint"><text :value="'hi'"></text></div>
        <div v-if="count > 0"><text :value="count"></text></div>
        <div v-if="tab == 'home'"><text :value="tab"></text></div>
        <div v-if="items => items.length > 0"></div>
      </template>
      <script>export default { data: { showHint: true, count: 0, tab: 'home', items: [1] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.errors.filter((e) => e.startsWith('V7')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V8: 生命周期白名单', () => {
  test('拼错的生命周期应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default {
  data: {},
  onReady() { console.log('hi'); } // 拼错
}</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V8') && w.includes('onReady')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法生命周期不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default {
  data: {},
  beforeCreate() {},
  didMount() {},
  didAppear() {},
  methods: { onClick() {} }
}</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V8')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V9: 死代码检测', () => {
  test('data 中定义了模板没用的字段应报 info', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="used"></text></template>
<script>export default { data: { used: 1, unused: 2 } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.info.some((i) => i.includes('unused')), 'unused 字段应在 info 中');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('所有字段都用到应无 info', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="title"></text></template>
<script>export default { data: { title: 'hi' } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.info.filter((i) => i.startsWith('V9')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V10: 空模板 / 空 script', () => {
  test('缺 <template> 应 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<script>export default { data: {} }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('template')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('缺 <script> 应 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.includes('script')));
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V11: <style> CSS 词法', () => {
  test('非白名单单位 em/rem 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: {} }</script>
<style>.root { font-size: 2em; width: 50%; }</style>`
    );
    const r = validateCard(tmpDir);
    const v11 = [...r.warnings, ...r.info].filter((m) => m.startsWith('V11'));
    assert.ok(v11.length >= 2, `应至少 2 条 V11 告警（em + %），实际 ${v11.length}: ${v11.join(' | ')}`);
    assert.ok(v11.some((m) => m.includes('em')), 'em 应被报');
    assert.ok(v11.some((m) => m.includes('%')), '% 应被报');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('z-index 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: {} }</script>
<style>.root { z-index: 99; }</style>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V11') && w.includes('z-index')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('position: fixed 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: {} }</script>
<style>.root { position: fixed; }</style>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V11') && w.includes('position')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('background-image url(http) 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: {} }</script>
<style>.root { background-image: url("http://example.com/x.png"); }</style>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V11') && w.includes('http://')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test(':hover 伪类应被 info 提示', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: {} }</script>
<style>.root:hover { color: red; }</style>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.info.some((i) => i.startsWith('V11') && i.includes('hover')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法 CSS（px/rpx）不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: {} }</script>
<style>.root { font-size: 16px; width: 200rpx; color: red; }</style>`
    );
    const r = validateCard(tmpDir);
    assert.equal([...r.warnings, ...r.info].filter((m) => m.startsWith('V11')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V12: XSS / 不安全执行', () => {
  test('script 段使用 eval 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    run(input) {
      return eval(input);
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V12') && e.includes('eval')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('script 段使用 new Function 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    build() {
      return new Function('return 1')();
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V12') && e.includes('Function')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('template 段 v-html 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div v-html="userInput"></div></template>
<script>export default { data: { userInput: '<img src=x>' } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V12') && e.includes('v-html')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('script 段对 this.xxx 用 innerHTML 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    setHtml() {
      this.box.innerHTML = '<img src=x>';
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V12') && e.includes('innerHTML')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法 script（无危险 API）不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="title"></text></template>
<script>
export default {
  data: { title: 'safe' },
  methods: {
    set() { this.title = 'ok'; }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.errors.filter((e) => e.startsWith('V12')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V13: v-for 不能嵌套 v-for', () => {
  test('嵌套 v-for 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <div v-for="g in groups" :key="g">
          <text v-for="item in g.list" :key="item">{{item}}</text>
        </div>
      </template>
<script>export default { data: { groups: [{ list: [1,2,3] }] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V13')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('单层 v-for 不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <div v-for="item in items" :key="item">
          <text :value="item"></text>
        </div>
      </template>
<script>export default { data: { items: [1,2,3] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V13')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V14: 业务逻辑完备性', () => {
  test('method 内 if 缺 else 且有 return 应被 info 提示', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    run(x) {
      if (x > 0) {
        return 'pos';
      }
      return 'neg';
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.info.some((i) => i.startsWith('V14') && i.includes('if 缺 else')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('三元嵌套深度 >2 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><text :value="grade"></text></template>
<script>
export default {
  data: { s: 50, grade: '' },
  methods: {
    set() {
      this.grade = (this.s > 90 ? 'A' : (this.s > 80 ? 'B' : (this.s > 60 ? 'C' : 'D')));
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V14') && w.includes('三元嵌套')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('method 写 this.xxx 未在 data 声明 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: { known: 1 },
  methods: {
    bump() {
      this.ghost = this.known + 1;
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V14') && w.includes('this.ghost')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法 method（声明 data + 简单 if/else）不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: { x: 0 },
  methods: {
    run(v) {
      if (v > 0) {
        this.x = v;
      } else {
        this.x = 0;
      }
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal([...r.warnings, ...r.info].filter((m) => m.startsWith('V14')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V15: JSDoc 缺失', () => {
  test('method 缺 jsdoc 注释应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    doIt() {
      return 1;
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V15') && w.includes('doIt')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('method 带 jsdoc 注释不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    /**
     * 干点啥
     */
    doIt() {
      return 1;
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V15')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V16: F2 图表 props 校验', () => {
  test('F2Chart 缺 data 应被命中', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><F2Chart /></template>
<script>export default { data: {} }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok([...r.warnings, ...r.info, ...r.errors].some((m) => m.startsWith('V16') && m.includes('data')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('F2Chart 带 data + 硬编码 hex 颜色应被 info', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template>
        <F2Chart :data="chartData" :color="'#ff0000'" />
      </template>
<script>export default { data: { chartData: [] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.info.some((i) => i.startsWith('V16') && i.includes('#')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法 F2Chart 使用 (有 data) 不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><F2Chart :data="chartData" /></template>
<script>export default { data: { chartData: [{ x: 1, y: 2 }] } }</script>`
    );
    const r = validateCard(tmpDir);
    const dataMsgs = [...r.warnings, ...r.info, ...r.errors].filter((m) => m.startsWith('V16') && m.includes('data'));
    assert.equal(dataMsgs.length, 0, `不应有 V16 data 缺失告警: ${dataMsgs.join('; ')}`);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V17: mpaas 客户端 API 调用', () => {
  test('requireModule 参数名不是 mpaas_jsapi 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const api = requireModule('not_mpaas');
    api.rpc({});
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V17') && e.includes("必须是 'mpaas_jsapi'")));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('requireModule 丢弃返回值应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    requireModule('mpaas_jsapi');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V17') && w.includes('必须赋值')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('mpaasApi 调用未知方法应被 info', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const mpaasApi = requireModule('mpaas_jsapi');
    mpaasApi.ghostMethod({});
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.info.some((i) => i.startsWith('V17') && i.includes('ghostMethod')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法 mpaasApi.rpc 调用不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const mpaasApi = requireModule('mpaas_jsapi');
    mpaasApi.rpc({ url: '/x' });
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    const v17 = [...r.errors, ...r.warnings, ...r.info].filter((m) => m.startsWith('V17'));
    assert.equal(v17.length, 0, `不应有 V17 告警: ${v17.join('; ')}`);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V18: data 边界', () => {
  test('data 顶层字段数超 maxObjKeys 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    const fields = Array.from({ length: 60 }, (_, i) => `k${i}: ${i}`).join(', ');
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: { ${fields} } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V18') && e.includes('顶层字段数')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('data 数组长度超 maxArrayLen 应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    const arr = Array.from({ length: 200 }, (_, i) => i).join(', ');
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: { big: [${arr}] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V18') && e.includes('数组长度')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法 data 不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>export default { data: { title: 'hi', items: [1, 2, 3] } }</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.errors.filter((e) => e.startsWith('V18')).length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V19: 交易流程序列图', () => {
  test('同一 method 内多个非 await rpc 应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    run() {
      const mpaasApi = requireModule('mpaas_jsapi');
      mpaasApi.rpc({ url: '/a' });
      mpaasApi.rpc({ url: '/b' });
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V19') && w.includes('非 await')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('合法串行 await rpc 应只生成 info 序列图', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  methods: {
    async run() {
      const mpaasApi = requireModule('mpaas_jsapi');
      await mpaasApi.rpc({ url: '/a' });
      await mpaasApi.rpc({ url: '/b' });
    }
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.equal(r.warnings.filter((w) => w.startsWith('V19')).length, 0);
    assert.ok(r.info.some((i) => i.startsWith('V19') && i.includes('序列图')));
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V20: common 模块引用', () => {
  test('@ 前缀（npm 形式）应被报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const f = require('@common/format');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V20') && e.includes('@ 前缀')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('引用未在白名单的 common 子模块应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const ghost = require('../common/ghost-helper');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V20') && e.includes('ghost-helper')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('引用白名单内的 common 模块不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const toast = require('../common/toast');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    const v20 = [...r.errors, ...r.warnings, ...r.info].filter((m) => m.startsWith('V20'));
    assert.equal(v20.length, 0, `不应有 V20 告警: ${v20.join('; ')}`);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('V21: env 环境配置引用', () => {
  test('引用未知环境名（不在白名单）应报 error', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const cfg = require('./.env.weird');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.errors.some((e) => e.startsWith('V21') && e.includes('weird')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('同一 script 引多个 env 文件应报 warning', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const a = require('./.env.sit');
    const b = require('./.env.uat');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.warnings.some((w) => w.startsWith('V21') && w.includes('同时引用了')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('本地环境配置（.env.local）应被 info 提示', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const cfg = require('./.env.local');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    assert.ok(r.info.some((i) => i.startsWith('V21') && i.includes('本地环境配置')));
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('单个合法 env 引用不应被报', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'main.vue'),
      `<template><div></div></template>
<script>
export default {
  data: {},
  beforeCreate() {
    const cfg = require('./.env.sit');
  }
}
</script>`
    );
    const r = validateCard(tmpDir);
    const v21 = [...r.errors, ...r.warnings, ...r.info].filter((m) => m.startsWith('V21'));
    assert.equal(v21.length, 0, `不应有 V21 告警: ${v21.join('; ')}`);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('汇总工具', () => {
  test('summarize 应能统计 pass/fail/warn', () => {
    const fake = [
      { card: 'a', errors: [], warnings: ['x'], info: [] },
      { card: 'b', errors: ['y'], warnings: [], info: [] },
    ];
    const s = summarize(fake);
    assert.equal(s.total, 2);
    assert.equal(s.passCount, 1);
    assert.equal(s.failCount, 1);
    assert.equal(s.bySeverity.warning, 1);
    assert.equal(s.bySeverity.error, 1);
  });
});
