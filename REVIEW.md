# ACT Cube 卡片代码评审报告

> Skill 的完整技术评审文档。本文档分两部分：
> - **第一部分** 是评测机制（怎么评、用什么工具、覆盖什么）
> - **第二部分** 是最近一次运行的结果（实际卡片跑了什么、有没有发现问题）
>
> 本文档本身**不记录每次运行的快照**——运行结果用 `node cli.js --report out/report` 生成 JSON + Markdown，附在 CI 工件里。

---

## 第一部分：评测机制

### 1.1 评测目标

为 ACT Cube DSL 编写的卡片（Vue 单文件组件 + 简单 data/methods 业务）提供：
- **静态 AST 校验**：源码层级即可发现错误
- **产物分析**：编译后的 `main.json` / `main.js` / `main.mock` 结构正确性
- **运行时行为**：用自研 Cube 引擎模拟运行产物
- **代码规范**：DSL 特定的 ESLint 规则

新增卡片**零成本**：往 `config.yaml` 的 `cards:` 数组里加一行，跑 `node cli.js`，全套通用断言自动覆盖。

### 1.2 工具结构

```
.
├── cli.js                   # 一键入口（端到端评测循环）
├── cube-engine.js           # 自研 Cube 引擎（AST 解释器，e2e 用）
├── config.yaml              # skill 唯一 YAML 主登记（cards/agent/rules）
├── package.json             # 依赖
├── validate/                # 静态校验（多维度规则全自包含）
│   ├── index.js             #   校验聚合层（validateCard / validateAll / summarize）
│   ├── index.test.js        #   静态校验测试（反例 + 正向）
│   ├── rules.config.json    #   规则注册表 + severity + options
│   ├── rules.config.schema.json  # rules.config.json 的 JSON Schema
│   └── rules/               #   规则实现（按维度子目录）
│       ├── _shared/context.js   #   共享 AST 上下文
│       ├── structure/       #   结构类规则
│       ├── logic/           #   逻辑类规则
│       ├── style/           #   样式类规则
│       ├── security/        #   安全类规则
│       ├── business/        #   业务类规则
│       ├── ecosystem/       #   生态类规则
│       ├── data/            #   数据类规则
│       └── dim-README.md    #   维度说明
├── unit/                    # 产物单测
│   └── index.test.js        #   读 dist 产物，校验结构
├── e2e/                     # 运行时 E2E
│   └── index.test.js        #   引擎解释执行
├── eslint/                  # 代码规范
│   ├── plugin.js            #   cube/* 自定义规则（卡片结构专属）
│   ├── skill.config.mjs     #   lint skill 工程自身 JS
│   ├── card.config.mjs      #   lint 卡片 .vue SFC
│   └── index.test.js        #   ESLint 测试套件
├── config/                  # 配置加载器
│   ├── index.js             #   卡片清单 + yaml 解析 + 路径 + config.yaml 统一 schema 校验
│   ├── config.schema.json   #   config.yaml（cards + agent）的 JSON Schema
│   ├── rules-loader.js      #   validate 规则注册表加载（数据在 validate/ 下）
│   └── agent-loader.js      #   agent 配置加载（yaml 优先）
├── contracts/scaffolder.js  # 自动生成规则脚手架（输出到 validate/rules/）
├── agent/                   # agent LLM 客户端
│   ├── llm-client.js        #   OpenAI 兼容 POST + 超时控制
│   ├── excel-converter.js   #   CSV/XLSX → case.md
│   └── testgen.js           #   case.md → main.test.js
├── reference/               # 知识库（内网部署友好）
├── REPORT_TEMPLATE.md       # 报告字段说明
└── out/                     # report.last.json 自动同步
```

### 1.3 评测流程

```
┌──────────┐
│ cli.js   │
└────┬─────┘
     │
     ▼
┌──────────────────────┐
│ 1) act build (子进程)│  ACT 编译器把所有卡片编译到 dist/<card>/main.{json,js,mock,...}
└────┬─────────────────┘
     ▼
┌──────────────────────┐
│ 2) validate/index.js   │  对每张卡：buildContext（vue-eslint-parser + espree）→ V1-V23 规则 check
└────┬─────────────────┘
     ▼
┌──────────────────────┐
│ 3) unit/index.test.js│  读 dist/main.{json,js,mock} 校验产物结构
└────┬─────────────────┘
     ▼
┌──────────────────────┐
│ 4) e2e/index.test.js │  cube-engine/index.js 实例化产物，模拟 vdom 构建、事件触发、生命周期
└────┬─────────────────┘
     ▼
┌──────────────────────┐
│ 5) eslint/index.test.js│  ESLint 跑 cube/* + vue/* + JS 规则
└────┬─────────────────┘
     ▼
┌──────────────────────┐
│ 6) 输出 report.json  │  + report.md（人类可读版）
└──────────────────────┘
```

### 1.4 静态规则

| ID | 维度 | 严重度 | 校验内容 | JSON options |
|----|------|--------|---------|-------------|
| V1 | 结构 | error | manifest.json 必填字段 + JSON Schema | — |
| V2 | 结构 | warning | template 标签白名单 | `allowedTags` / `replaceDefaults` |
| V3 | 结构 | warning | bind / event / 普通属性白名单 | `allowedAttrs/BindKeys/Events` |
| V4 | 逻辑 | warning | bind 表达式引用 data / methods 合法性 | — |
| V5 | 逻辑 | warning | 事件回调指向方法存在 | — |
| V6 | 逻辑 | warning | v-for 数据源在 data 声明 | — |
| V7 | 逻辑 | error | v-if 表达式合法（禁赋值 / 禁语句序列） | — |
| V8 | 结构 | warning | 生命周期钩子白名单 | `allowedLifecycle` |
| V9 | 逻辑 | info | data / methods 死代码 | — |
| V10 | 结构 | warning | template / script / style 完整性 | — |
| V11 | 样式 | warning/info | CSS 词法（单位 / url / 伪类） | — |
| V12 | 安全 | error | XSS（eval/Function/v-html/innerHTML） | — |
| V13 | 业务 | warning | v-for 嵌套 v-for | — |
| V14 | 业务 | warning/info | if 缺 else / 三元嵌套 / 未声明 data | — |
| V15 | 业务 | warning | 方法 / lifecycle 缺 JSDoc 注释 | — |
| V16 | 生态 | warning/info | F2 图表 props + hex 颜色 | — |
| V17 | 生态 | error | requireModule('mpaas_jsapi') 合法性 | `apiWhitelist` |
| V18 | 数据 | error | data 数组 / 对象边界 | `maxArrayLen` / `maxObjKeys` / `maxDepth` |
| V19 | 数据 | warning | 交易流程序列图 + 串行调用 | — |
| V20 | 生态 | error/warning | common 模块引用（@ 前缀禁用） | `allowedNames` / `baseName` |
| V21 | 生态 | error/info | env 环境配置引用 | `allowedEnvNames` |
| V22 | 结构 | warning | 文本节点禁嵌套 | — |
| V23 | 生态 | warning | setTimeout/setInterval 需在 didDisappear 清理 | — |

每条规则的实现位置 `validate/rules/<dim>/V*.js`（按维度子目录）；注册位置 `validate/rules.config.json`（含 severity + options）。

### 1.5 E2E 维度

| 维度 | 内容 |
|------|------|
| E1 | 产物可加载 / 实例化 |
| E2 | 初始数据 + beforeCreate 联动 |
| E3 | 生命周期调用顺序 |
| E4 | 事件触发 + state 联动 |
| E5 | v-for 展开数量与子节点 |
| E6 | 表达式与运算（字符串 / 三元 / 数组方法） |
| E7 | mock 数据替换 |
| E9 | 完整流程综合 |
| E10 | 性能维度（实例化耗时、节点数、methods 数） |
| E11 | 可访问性（image alt、text 值） |
| E12 | 安全（事件内无 eval / new Function） |
| E13 | 功能性（data/export 存在、methods 形态、顶层去重、生命周期体非空） |
| E14 | 结构唯一（meta.name 跨卡 / nid 全局唯一） |
| E15 | mock 完整性（必填 + 规模 + 至少 1 key 被消费） |
| E16 | 资源 / i18n 一致性（src 形态、locale 对齐） |
| E17 | 禁用元素黑名单 + 事件方法名有效性 |
| E18 | 结构密度 + 循环引用 |

### 1.6 自定义 ESLint 规则

| 规则 | 描述 | 严重度 |
|------|------|--------|
| `cube/no-unknown-lifecycle` | 钩子必须在白名单内 | error |
| `cube/no-magic-event` | 事件回调（onXxx / handleXxx）内禁止 eval/Function | error |
| `cube/no-shadow-data` | method 内 var/let/const 名字遮蔽 data 字段 | warning |
| `cube/no-magic-color-hex` | 硬编码 hex/rgb 颜色（应走 design token） | warning |
| `cube/no-hardcoded-secret` | 硬编码 token/password/secret（OWASP A02 + SonarJS S2068/S6418/S6437） | error |
| `cube/no-setinterval-string` | setTimeout/setInterval 传字符串隐式 eval（SonarJS S7860） | error |
| `cube/no-global-this` | window / globalThis / self（绕过宿主沙箱，SonarJS S2990） | error |
| `cube/no-throw-literal` | throw 字符串/数字/对象（SonarJS S3696） | error |

### 1.7 知识库

`reference/` 目录下的两份文档描述了 Skill 的设计依据：
- `code-review-checklist.md` — 指标源（OWASP A03 / SonarJS S2076 / eslint-plugin-vue / 阿里 F2 / cube-lint）
- `json-capabilities.md` — JSON 配置能驱动的所有校验能力 + 哪些校验代码层硬编码

Skill 部署到内网时**所有 reference 都在仓库里**，不需要联网。

### 1.8 边界说明

- 静态校验器是**启发式 AST 校验**，不替代 ACT 编译器本身。
- 自研 `cube-engine/` 是**AST 解释器**（不是 vm 沙箱），覆盖 ACT 文档列出的核心能力；复杂运行时行为以真机为准。
- ESLint 规则的 `scriptAst` 来自 `vue-eslint-parser` 内部对 `<script>` 段的解析（ES5 风格 IIFE 包装过的 `var main` 形式）。
- 默认忽略 i18n / PB 资源等 ACT 编译器的 informational 告警（与业务无关）。

### 1.9 如何复现

```bash
cd /Users/hanamaki_mac_mini/Documents/github/act-cube

# 完整跑：build + 校验 + 单测 + E2E + ESLint + 报告
node cli.js

# 跳过编译（产物已存在）
node cli.js --skip-build

# 只跑某个阶段
node cli.js --skip-build --stage validate
node cli.js --skip-build --stage unit
node cli.js --skip-build --stage e2e
node cli.js --skip-build --stage eslint

# 子集模式：只评指定卡片
node cli.js --skip-build --card hello-cube,chart-bar

# 写报告
node cli.js --skip-build --report ./out/report
# → out/report.json + out/report.md
```

### 1.10 新增卡片

```bash
# 1) 创建源
mkdir -p ../src/<name>/cards/<name>
cat > ../src/<name>/cards/<name>/manifest.json <<EOF
{ "name": "<name>", "version": "1.0.0", "compilerType": 1, "jsformat": 1 }
EOF
# 写 main.vue 和 mock.json

# 2) 编译
node cli.js   # 默认会跑 act build

# 3) 把 <name> 加到 config.yaml 的 cards 段
# 4) 跑测试
node cli.js --skip-build
```

如果新增的是"业务特化"卡片（比如用了 common / env / F2 图表 / mpaas 客户端 API），需要去 `validate/rules.config.json` 里相应规则的 `options.allowedXxx` 加白名单条目。

---

## 第二部分：运行结果（最近一次快照在 `out/`）

> 本节不存具体数字快照（每次跑都不同）。最近一次运行的 JSON 副本在
> `out/report.last.json`，由 `cli.js --report` 自动同步；CI 工件通常带完整
> `<report>.json` + `<report>.md`。**评测目标**完全由 `config.yaml` 的
> `cards:` 段决定，所以"当前评测目标"列表在本节里不重复列——直接查 config.yaml。

### 2.1 报告落点

- `out/report.last.json`：最近一次 `--report` 触发的 JSON 副本
- `<report>.json` / `<report>.md`：`--report <base>` 指定的具体路径
- 详细字段说明见 `REPORT_TEMPLATE.md`

### 2.2 已知非阻断告警（info 级别）

下列告警**不影响 exit 0**，仅作为改进建议（具体命中看当次 report）：

| 来源 | 维度 | 告警 |
|------|------|------|
| V15 | 业务 | 方法/lifecycle 缺 JSDoc 注释 |
| V15 | 业务 | `data` 字段建议补 JSDoc 说明类型/默认值 |
| V19 | 数据 | 序列图自动生成（info） |
| E11 | 可访问性 | `<image>` 缺 alt（软告警） |
| E18 | 密度 | 简单卡片节点数偏少 |

### 2.3 已修复的真实 bug（在历史迭代中发现）

| 阶段 | 规则 | bug | 修复 |
|------|------|------|------|
| 批次 3 | V12 | `eval` 误报 `@click` 原始事件属性 | 定向 `directive=false` + 小写 onXxx |
| 批次 3 | V19 | `attachParents` 触发 parent→root→parent 栈溢出 | 加 `SAFE_KEYS` 白名单只走 ESTree 字段 |
| 批次 4 | V15 | JSDoc 文本里的 `*/` 提前关闭块注释 | 改用 "jsdoc 注释" 文字描述 |
| 批次 4 | V20 | 误以为卡片能用 `@common/xxx` | 改为相对路径引用 `common/` 文件夹 |
| 批次 4 | V21 | 误以为用 `getEnv('xxx')` / `process.env` | 改为直接 require `.env.sit` 等文件 |
| 批次 6 | V11 | 不报 `%` 单位（Percentage 节点 unit 为空） | 加 `unit || '%'` 兜底 |
| 批次 6 | V11 | url(http) 检测 value 形态错误 | 兼容 string 形态 |
| 批次 6 | V12 | 漏 `new Function(...)` (NewExpression) | 加 |
| 批次 6 | V16 | F2Chart 大小写不匹配（vue-eslint-parser 转小写） | 改小写匹配 |
| 批次 6 | V16 | hex 只查静态值 | 加表达式 AST 递归 |
| 批次 6 | V19 | 只查 methods 不查 lifecycle | 加 lifecycle 桶 |
| 批次 6 | V21 | `.env.local` 当 error | 本地后缀优先 info |

### 2.4 后续工作（v6 重构后）

| 优先级 | 方向 | 状态 |
|--------|------|------|
| 🟡 P1 | `rules/` 按维度拆子文件夹（structure / logic / style / security / business / ecosystem / data） | ✅ v6 完成 |
| 🟡 P1 | `test/` 按类型拆子文件夹（validate / unit / e2e / eslint） | ✅ v6 完成 |
| 🟡 P1 | 卡片配置改用 `config.yaml`（统一 skill 根目录 YAML 主登记） | ✅ v6 完成 |
| 🟡 P1 | 每张卡片专属测试（cases.csv / case.md / main.test.js 自包含） | ✅ v5 完成 |
| 🟡 P1 | report.json / REVIEW.md 模板 vs 报告职责分离 | ✅ v6 完成（见 REPORT_TEMPLATE.md） |
| 🟡 P1 | agent 配置 yaml 优先（env > yaml > json） | ✅ v6 完成 |
| 🟡 P1 | eslint / validate / unit / e2e 目录独立、四层职责互不重叠 | ✅ 已完成 |
| 🟢 P2 | V22+ 规则扩展：i18n 字段强校验、PB 资源完整性、性能采样 |
| 🟢 P2 | 接入真机：自研引擎产出的事件日志回放真机 trace |
| 🟢 P3 | cube-engine/ 升级：覆盖 v-model / 动画 / 跨卡片通信 |

---

*Skill 版本：v6.0（2026-09-10）*
*技术栈：vue-eslint-parser 7.x / espree 9 / css-tree 2.x / estraverse / esquery / ajv 8 / MD5 / Node.js 22 / OpenAI 兼容 LLM*
*参考实现：xcube 4.0 cube-lint（闭源）+ eslint-plugin-vue + SonarJS + OWASP A03*

## v5.0 增量

### Agent 生成专属测试
- `config.yaml` 的 `agent` 段 + `config/agent-loader.js`：provider / baseURL / apiKey / model / systemPrompt；env 优先级最高（`ACT_AGENT_ENABLED` / `ACT_AGENT_BASE_URL` / `ACT_AGENT_API_KEY` / `ACT_AGENT_MODEL`）
- `agent/llm-client.js`：标准 `POST {baseURL}/chat/completions`；自实现 https/http + abortController 超时，不引第三方 SDK
- `agent/excel-converter.js`：CSV（自实现引号转义）/ XLSX / XLS（`xlsx` npm 包，落到 `node_modules/xlsx`，cli 在 act-cube/ 跑时走绝对路径 fallback）；按 `card` 列分组输出 `src/<card>/case.md`（单卡 csv 无 card 列时用 `--agent-gen <card>` 自动归属）
- `agent/testgen.js`：拼装 prompt（main.vue + manifest + dist/main.js + dist/main.json + case.md）→ LLM → 抽 ```js ``` 围栏 → `node --check` 语法校验 → 落 `src/<card>/main.test.js`
- CLI：`--agent-gen cases.csv`（全量）/ `--agent-gen <card>`（单卡，自动找 `src/<card>/cases.csv`）；可加 `--card x,y` / `--agent-force` / `--agent-skip-gen`
- 流程：通用规则校验（1-4 阶段）→ 卡片专属测试（5 阶段，跑 `src/<card>/main.test.js`，cwd=`src/<card>/`），perCard 纳入汇总与退出码
- 产物全在卡片自包含目录：`src/<card>/{cases.csv, case.md, main.test.js}`，拷贝整张卡即带走测试

### 定时器生命周期清理规则
- `validate/rules/ecosystem/V23-timer-cleanup.js`：检测 script 顶层是否使用 `setTimeout / setInterval` 而未实现 `didDisappear` 中清理（`clearTimeout / clearInterval`）
- 严重度：warning（默认），可在 `validate/rules.config.json` 调为 error

## v6.0 增量（目录重构 + agent yaml 化）

### 四层职责独立
- `eslint/` 子目录：`plugin.js`（cube/* 规则）+ `skill.config.mjs`（lint skill 自身）+ `card.config.mjs`（lint 卡片 SFC）+ `index.test.js`
- `validate/` 子目录：`index.js`（校验聚合层）+ `index.test.js`（正向 + 反例）
- `unit/` 子目录：原 `unit.test.js` 迁移到 `unit/index.test.js`
- `e2e/` 子目录：原 `e2e.test.js` 迁移到 `e2e/index.test.js`
- 四层职责**互不重叠、互不引用**：validate 读源码、unit 读产物、e2e 解释执行、eslint 静态规范

### config.yaml 统一登记 + agent 优先
- `config.yaml` 位于 skill 根目录，作为 cards / agent 唯一 YAML 主登记
- `config/index.js` 兼任脚本层（yaml 解析 + 路径 + 统一 schema 校验）
- agent 加载优先级：env > `config.yaml` agent 段 > 默认值

### 报告与模板分离
- `REVIEW.md` / `README.md` / `SKILL.md`：skill 设计文档模板，手维护
- `out/report.last.json`：`cli.js --report` 自动同步最近一次结果
- `REPORT_TEMPLATE.md`：报告字段说明

### 依赖精简
- 删除未使用的 `@vue/compiler-sfc`（实际走 vue-eslint-parser）
- 确认无 `eslint-plugin-prettier`（与 ESLint v9 不兼容）
- package.json 加 `scripts.test:*` / `lint` 快捷命令