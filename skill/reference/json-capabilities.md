# ACT Cube Skill — JSON 配置化能力说明

> 回应 `cards/TODO.md#9`：「通过 json 格式，可以做到哪些校验，说明一下」

本文档说明 Skill 的 JSON 配置文件**当前能驱动哪些校验类型**，以及每个 JSON 字段如何映射到代码层的具体校验逻辑。

---

## 一、JSON 配置文件全景

| 配置文件 | 作用 | 是否必填 |
|---|---|---|
| `config.yaml` | 卡片清单 + agent 参数（权威 YAML 主登记） | 是 |
| `config/config.schema.json` | config.yaml 的统一 JSON Schema（cards + agent） | 否（仅校验时用） |
| `validate/rules.config.json` | validate 规则注册表 + severity + options | 是 |
| `validate/rules.config.schema.json` | rules.config.json 的 JSON Schema | 否 |

生产环境只需替换 `config.yaml` 的 cards 段 / agent 段，以及 `validate/rules.config.json`，无需改 skill 代码。ESLint 规则不在 JSON 里登记，真实来源见 `eslint/card.config.mjs`。

---

## 二、config.yaml — 卡片清单与 agent 参数

```yaml
cards:
  - hello-cube
  - user-profile
agent:
  enabled: false
  provider: openai-compatible
  baseURL: https://api.openai.com/v1
  apiKey: ""
  model: gpt-4o-mini
  temperature: 0.2
  maxTokens: 4096
  timeoutMs: 60000
```

| 字段 | 类型 | 校验行为 |
|---|---|---|
| `cards` | string[] | 至少 1 项；每项匹配 `^[a-zA-Z][a-zA-Z0-9_-]*$`；不允许重复 |
| `agent.*` | object | LLM 调用参数；`enabled=true` 时 `baseURL/apiKey/model` 必填 |

**驱动的下游行为**：
- `loadCardList()`：读取 `config.yaml.cards` 作为权威卡片清单
- `validateAll()`：遍历每个卡片名 → `buildContext` → 跑 `validate/rules.config.json` 里所有启用规则
- `unit/index.test.js` / `e2e/index.test.js`：从 `loadCardList()` 读取卡片清单
- CLI：`--card hello-cube,chart-bar` 子集模式基于该清单过滤

---

## 三、validate/rules.config.json — validate 规则注册表

### 3.1 顶层结构

```json
{
  "rules": [ ... ]
}
```

| 顶层字段 | 类型 | 校验行为 |
|---|---|---|
| `rules` | 数组 | 必填。每项是「validate 规则」声明 |

### 3.2 rules[] 单条声明的字段

| 字段 | 类型 | 必填 | 校验行为 |
|---|---|---|---|
| `id` | string | 是 | 匹配 `^[A-Za-z][A-Za-z0-9_-]*$` |
| `module` | string | 是 | 相对 skill 根目录的模块路径（如 `./validate/rules/structure/V1-manifest`） |
| `severity` | enum | 是 | 仅接受 `error` / `warning` / `info`；非法值启动时就抛错 |
| `enabled` | boolean | 否 | 默认 `true`。设为 `false` 即跳过该规则的所有校验 |
| `description` | string | 否 | 给 `cli.js --list-rules` 用，无逻辑影响 |
| `options` | object | 否 | 透传给规则的 `ctx._ruleOptions`（具体见下文「各规则 options」表） |

---

## 四、各规则 options 驱动哪些校验

### 4.1 V2 标签白名单

```json
{ "options": { "allowedTags": ["my-component"], "replaceDefaults": false } }
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `allowedTags` | string[] | `[]` | 额外追加的白名单标签 |
| `replaceDefaults` | boolean | `false` | 是否替换默认白名单。true = 仅用 JSON 给的标签；false = 默认白名单 + JSON 标签 |

### 4.2 V3 属性白名单

```json
{ "options": {
    "allowedAttrs": ["data-track-id"],
    "allowedBindKeys": ["label"],
    "allowedEvents": ["custom-event"],
    "replaceDefaults": false
}}
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `allowedAttrs` | string[] | `[]` | 额外追加的普通 HTML 属性白名单 |
| `allowedBindKeys` | string[] | `[]` | 额外追加的 bind 属性白名单（`:x` / `v-bind:x`） |
| `allowedEvents` | string[] | `[]` | 额外追加的事件白名单（`@x` / `v-on:x`） |
| `replaceDefaults` | boolean | `false` | 是否替换默认白名单 |

### 4.3 V8 生命周期白名单

```json
{ "options": { "allowedLifecycle": ["customHook"], "replaceDefaults": false } }
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `allowedLifecycle` | string[] | `[]` | 额外追加的 script 顶层函数（生命周期钩子）白名单 |
| `replaceDefaults` | boolean | `false` | 是否替换默认白名单 |

### 4.4 V11 CSS 词法（无 options）

单位 / 伪类 / url 形态校验内置实现，不可 JSON 配置。

### 4.6 V15 JSDoc（无 options）

方法/lifecycle 缺注释检测内置实现。

### 4.6 V16 F2 图表（无 options）

`<F2Chart />` 必填 props 检测内置实现。

### 4.7 V17 mpaas API 白名单

```json
{ "options": { "apiWhitelist": ["myRpc", "myStorage"], "replaceDefaults": false } }
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `apiWhitelist` | string[] | `[]` | 额外追加的 mpaasApi 方法白名单 |
| `replaceDefaults` | boolean | `false` | 是否替换默认白名单（默认含 rpc/storage/push/...） |

### 4.8 V18 数据边界阈值

```json
{ "options": { "maxArrayLen": 50, "maxObjKeys": 20, "maxDepth": 4 } }
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `maxArrayLen` | number | `100` | data 内单个数组字面量的元素数上限。超 → error |
| `maxObjKeys` | number | `50` | data 内单个对象字面量的 key 数上限。超 → error（顶层）/ warning（嵌套） |
| `maxDepth` | number | `5` | data 嵌套对象/数组深度上限（当前未递归触发，预留给完整深度扫描） |

### 4.9 V19 交易流程序列图（无 options）

序列图自动生成。

### 4.10 V20 common 公共方法引用

```json
{ "options": { "allowedNames": ["toast"], "maxImports": 5, "baseName": "common", "replaceDefaults": false } }
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `allowedNames` | string[] | `[]` | 允许 `require('./common/<name>/...')` 引用的子模块名。默认白名单含 `toast` / `format` / `date` / `validator` |
| `maxImports` | number | `Infinity` | 单 script 内 require common 的次数上限。超 → warning |
| `baseName` | string | `"common"` | common 文件夹的根名（按项目结构改成 `libs` / `shared` 等） |
| `replaceDefaults` | boolean | `false` | 是否替换默认白名单 |

**注意**：禁止 `@common/xxx` 这种 `@` 前缀路径（npm namespace 形式，卡片不能用）。

### 4.11 V21 env 环境配置文件引用

```json
{ "options": { "allowedEnvNames": ["sit", "uat"], "warnOnMultiple": true, "replaceDefaults": false } }
```

| options 字段 | 类型 | 默认值 | 行为 |
|---|---|---|---|
| `allowedEnvNames` | string[] | `[]` | 允许引用的 env 后缀（默认白名单含 `sit` / `uat` / `prod` / `pre` / `gray`） |
| `warnOnMultiple` | boolean | `true` | 单 script 引多个不同 env 文件是否告警 |
| `replaceDefaults` | boolean | `false` | 是否替换默认白名单 |

**检测形态**：`require('./.env.sit')` / `require('../.env.uat')` / `require('../../.env.prod')` 等相对路径。

**本地配置提示**：`.env.dev` / `.env.local` / `.env.test` / `.env.mock` 出现会发 info 提示「不应进生产」。

---

## 五、JSON 不能表达的校验（代码层硬编码）

下列校验**目前只能靠改 skill 代码**才能调整，配置层没暴露：

| 校验 | 原因 |
|---|---|
| V4 bind 表达式语法合法性 | 走 espree 解析硬编码 |
| V5 事件方法存在性 | 走 vue-eslint-parser 解析硬编码 |
| V6 v-for 数据源存在性 | 同上 |
| V7 v-if 表达式合法性 | 同上 |
| V9 死代码（data/methods 引用计数） | 算法内置 |
| V10 template/script/style 完整性 | 三段是否存在硬编码 |
| V12 XSS 检测模式 | 危险 API 黑名单硬编码（eval/Function/innerHTML/v-html/...） |
| V13 v-for 嵌套检测 | 递归扫描硬编码 |
| V14 if 缺 else / 三元嵌套 >2 / 未声明 data | 阈值（>=2 嵌套）硬编码 |
| V19 串行调用检查（mpaasRpc 名称匹配） | 正则 `^mpaas` 硬编码 |

> 后续若要把这些也 JSON 化，可在对应规则的 `options` 加字段，然后改 `rules-loader.js` 注入 `ctx._ruleOptions`（loader 已经透传）。

---

## 六、JSON 驱动的端到端流程

```
config.yaml (cards / agent)
       │
       ▼
validate/rules.config.json (validate 规则注册表 + severity + options)
       │
       ▼
rules-loader.js
  ├─ ajv 校验 JSON schema
  ├─ require() 加载 module（模块 export check(ctx, result, cardName)）
  └─ 透传 options → ctx._ruleOptions
       │
       ▼
validate/index.js
  ├─ buildContext（vue-eslint-parser + espree）
  └─ 顺序执行 rules[] → errors / warnings / info
       │
       ▼
报告输出（CLI / report.json）
```

---

## 七、生产环境替换示例

把 skill 用到新项目，只需：
1. 修改 `skill/config.yaml`，把 `cards` 数组改成新项目的卡片名；按需调整 `agent` 段
2. 复制 `skill/validate/rules.config.json`，根据新项目规范调整：
   - 不需要的规则 → `"enabled": false`
   - 需要放宽的白名单 → 在对应 `options` 加 `allowedXxx`
   - 想升级严重度 → 改 `severity`
3. 把 skill 放到 `act-cube/skill/`（或任意目录），用 `CARDS_ROOT=/path/to/cards CARDS_SUBDIR=src node cli.js --skip-build` 跑

CLI 子集模式 `--card` 会基于 `config.yaml` 的卡片清单做过滤，跑部分卡片做冒烟。