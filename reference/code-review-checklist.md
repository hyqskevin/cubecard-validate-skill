# ACT Cube 卡片代码评审知识库（本地版）

> 这是 Skill 内置的"指标源"知识库。**所有内容在仓库内**——Skill 部署到内网不需要联网。
>
> 涵盖 V12+ 规则涉及的行业清单、攻击面、防御要点。本文只摘录 ACT Cube DSL 实际能用到的部分，并附每条对应的 V*/cube/* 规则 ID。

---

## 1. 来源（已确认，2026-09-09 抓取）

| 来源 | 用于规则 | 抓取快照 |
|------|---------|---------|
| OWASP Top 10 2021 A03 Injection | V12 XSS / V17 mpaas 注入 | 见 §2 |
| SonarJS S2076 / S5147 / S5334 | V12 eval / Function / v-html | 业界标准 |
| eslint-plugin-vue v-for 必带 key | V6 / V13 嵌套检测 | 官方 |
| 阿里 F2 图表规范 | V16 props 校验 | https://f2.antv.antgroup.com/ |
| xcube 4.0 cube-lint | cube/no-unknown-lifecycle / cube/no-magic-event | 闭源，按公开 API 复刻 |

---

## 2. OWASP A03 Injection（XSS 子集）

> 来源：https://owasp.org/Top10/2021/A03_2021-Injection/（2026-09-09 抓取快照）

### 2.1 描述

应用在以下情况易被注入攻击：
- 用户输入未验证、过滤或消毒
- 动态查询或非参数化调用未做上下文转义
- 敌对数据被直接拼接进 SQL / OS / 命令 / EL / OGNL

**Web 端最常见**是 CWE-79 XSS（Cross-Site Scripting）。

### 2.2 防御要点（精简）

1. **首选安全 API**：用参数化接口 / ORM，避免直接拼字符串
2. **服务端白名单校验**：但不是完整防御
3. **残留动态查询**：用解释器特定的转义语法
4. **威胁建模 + SAST/DAST/IAST**：CI/CD pipeline 里集成

### 2.3 ACT DSL 适用清单

ACT 卡片是**单文件组件**，没有 SQL / OS 命令面，主要威胁面是 JS 执行 + HTML 注入：

| 攻击向量 | CWE | V* / cube/* 规则 |
|----------|-----|-----------------|
| `eval(userInput)` | CWE-95 Eval Injection | **V12** + `cube/no-magic-event` |
| `new Function(...)` | CWE-95 | **V12** |
| `el.innerHTML = userInput` | CWE-79 XSS | **V12** |
| `<div v-html="userInput" />` | CWE-79 | **V12** |
| `document.write(...)` | CWE-79 | **V12** |
| 模板里写 `onclick="..."` | CWE-80 Basic XSS | **V12**（防御性保留扫描） |
| 用 `requireModule` 引未知 module | CWE-94 Code Injection | **V17** |
| 引用未在白名单的 mpaasApi 方法 | CWE-470 Unsafe Reflection | **V17** |

---

## 3. SonarJS 关键规则（精简）

| 规则 ID | 描述 | ACT DSL 对应 |
|---------|------|-------------|
| S2076 | `eval` / `Function(...)` | V12 |
| S5147 | `Object.prototype` 直接赋值 | ACT DSL 弱（不直接改原型），可在 ESLint 标准规则 no-extend-native 覆盖 |
| S5334 | 弱加密（DES/RC4） | ACT DSL 弱（不直接调加密 API），通过 mpaas 间接走 |
| S1523 | `new Buffer(...)` 用 Buffer.from | ACT 引擎不暴露 Node API，跳过 |
| S1481 | 未使用变量 | V9（data/methods 死代码） |
| S3776 | 圈复杂度 | V14（三元嵌套 + if 缺 else） |
| S107 | 方法参数过多 | ACT DSL methods 普遍 < 5 参，跳过 |

---

## 4. eslint-plugin-vue 关键规则

| 规则 | 描述 | ACT DSL 对应 |
|------|------|-------------|
| `v-for 必带 key` | diff 性能 & 状态保留 | V6（数据源检测）+ V13（嵌套检测） |
| `no-v-html` | 不要用 v-html | V12 |
| `no-unused-vars` | 未用变量 | V9 |
| `no-magic-numbers` | 魔法数字 | ACT DSL 普遍用 0/1/-1，无需检测 |
| `max-attributes-per-line` | 一行一个属性 | 风格类，PASS |
| `v-on-event-hyphenation` | 事件名 kebab-case | ACT DSL 用 @click 单段即可，PASS |
| `attribute-hyphenation` | 属性名 kebab-case | 同上 |

---

## 5. 阿里 F2 图表规范

> 来源：https://f2.antv.antgroup.com/

### 5.1 必填 props

- `data`：图表数据（数组）
- `scale`：颜色 / 坐标轴

### 5.2 颜色 token

- 推荐走 design token，不要硬编码 hex
- 业务色：蓝/红/绿/黄等可走 `color: '#1677ff'` 但建议提为 token

### 5.3 单位

- 仅支持 px / rpx；em / rem / % 在 ACT 引擎被忽略

### 5.4 ACT DSL 对应

- **V16** 检测 `<F2Chart>` 缺 :data 必填 prop
- **V16** 检测表达式或静态值里含 hex
- **V11** 检测 CSS 单位

---

## 6. xcube 4.0 cube-lint 复刻

> 来源：@xcube/cube-ext-eslint 4.0.0（闭源 npm 包，公开 API）

| 规则 | ACT DSL 适用 | 严重度 |
|------|-------------|--------|
| `cube/no-unknown-lifecycle` | 钩子必须在白名单内 | error |
| `cube/no-magic-event` | 事件回调禁用 eval/Function | error |
| `cube/no-shadow-data` | 局部 var 遮蔽 data 字段 | warning |
| `cube/no-magic-color-hex` | 硬编码颜色 hex | warning |

> ACT 4.0 包内还有更多规则（如 `cube/no-mutate-prop`），但 ACT DSL 没 props 概念（只有 data），跳过。

---

## 7. ACT DSL 自定义规则（不是来自外部）

| 规则 | 描述 | 来源 |
|------|------|------|
| V7 v-if 禁赋值 | 防止 `v-if="x = 5"` | ACT DSL 解析器拒绝，预先拦截 |
| V8 生命周期白名单 | `beforeCreate/created/beforeMount/mounted/beforeUpdate/updated/didAppear/didDisappear/didMount` | ACT 文档 + 产物反编译 |
| V10 三段完整性 | 缺 template / script / style | ACT 编译要求 |
| V13 嵌套 v-for | ACT 引擎 v-for 嵌套性能差 | 业务约束 |
| V14 业务完备 | if 缺 else / 三元嵌套 / 未声明 data | ACT DSL 风格 |
| V15 JSDoc | 方法/lifecycle 缺注释 | 团队规范 |
| V19 交易流程序列图 | 串行 RPC + mermaid 序列图 | 金融业务强约束 |
| V20 common 模块 | 相对路径引用 `common/` 文件夹 | 团队目录约定 |
| V21 env 配置 | require `.env.sit` 等 | 团队目录约定 |
| V22 text 不可嵌套 | `<text>` / `<external-richtext>` 不可嵌套其他组件 | ACT 官方文档 |

---

## 7.1 DSL 文本组件专项规范（mPaaS 官方文档）

> 依据 mPaaS 蚂蚁动态卡片文档：`text`（[342782](https://help.aliyun.com/zh/document_detail/342782.html)）、`richtext`（[342784](https://help.aliyun.com/en/document_detail/342784.html)）。

| 组件 | 标签名 | 用途 | 嵌套限制 |
|------|--------|------|----------|
| **文本** | `<text>` | 纯文本渲染，只能包含文本值，可用 `{{}}` 插值 | **不可嵌套任何其他组件** |
| **富文本** | `<external-richtext>` | 渲染 HTML 富文本（br/span/div/b/h1-h6/i/p/img/a 等） | **不可嵌套任何其他组件** |

关键点：
- **富文本不是 `<text>` 属性**，而是独立的 `<external-richtext>` 组件（对应 skill 标签白名单已放行）。
- `<text>` 内若想展示多段样式文本，用多个 `<text>` 平铺，或用 `<external-richtext>` 承载 HTML。
- `<text>` 内的 `{{}}` 插值 / 裸文本算合法内容，不算嵌套。
- 富文本组件常用属性：`text`（HTML 字符串）、`line-space`、`linkColor`、`highlightedColor`、`detectEmotionEmoji`；支持 `tap/touchstart/...` 通用事件。
- V22 规则对上述两类标签统一检测"不可嵌套"。

---

## 8. 已实现的 22 条规则对照表

| V* | 名称 | 来源 | 严重度 |
|----|------|------|--------|
| V1 | manifest.json | ACT 文档 | error |
| V2 | 标签白名单 | ACT 文档 | warning |
| V3 | 属性白名单 | ACT 文档 | warning |
| V4 | 表达式引用 | 自研 | warning |
| V5 | 事件方法存在性 | 自研 | warning |
| V6 | v-for 数据源 | 自研 + eslint-plugin-vue | warning |
| V7 | v-if 表达式 | ACT 文档 | error |
| V8 | 生命周期白名单 | ACT 文档 + xcube | warning |
| V9 | 死代码 | SonarJS S1481 | info |
| V10 | 三段完整性 | ACT 文档 | warning |
| V11 | CSS 词法 | 阿里 F2 | warning/info |
| V12 | XSS | **OWASP A03** + SonarJS S2076 | error |
| V13 | 嵌套 v-for | ACT 引擎约束 | warning |
| V14 | 业务完备 | 自研 | warning/info |
| V15 | JSDoc | 团队规范 | warning |
| V16 | F2 图表 | **阿里 F2** | warning/info |
| V17 | mpaas API | 客户端 API 约束 | error |
| V18 | data 边界 | ACT 引擎内存约束 | error |
| V19 | 交易流程序列图 | 金融业务强约束 | warning |
| V20 | common 模块 | 团队目录约定 | error/warning |
| V21 | env 配置 | 团队目录约定 | error/info |
| V22 | text 不可嵌套 | ACT 官方文档 | warning |

| cube/* | 名称 | 来源 |
|--------|------|------|
| `cube/no-unknown-lifecycle` | 钩子白名单 | xcube 4.0 |
| `cube/no-magic-event` | 事件回调安全 | xcube 4.0 + OWASP A03 |
| `cube/no-shadow-data` | data 字段遮蔽 | 自研 |
| `cube/no-magic-color-hex` | 硬编码颜色 | 阿里 F2 规范 |

---

## 9. 知识库维护

- 本文件不引用任何外部 URL 作权威依据（避免 Skill 部署到内网后断网）
- 所有外部规范已转写为本地条目 + V*/cube/* 规则对应
- 新增规则时同步更新本文件第 7-8 节
- 版本：2026-09-09