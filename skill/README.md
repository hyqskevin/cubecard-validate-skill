# ACT Cube 卡片评测 Skill

> 基于 AST 静态校验 + 产物分析 + 自研引擎运行 + ESLint 规则的端到端 ACT Cube 卡片代码评审工具。

## 目录与职责

整个 skill 按"职责维度"切成 4 个独立子目录，每个目录承担一类校验：

| 目录 | 职责 | 入口 |
|------|------|------|
| `validate/` | **静态 AST 校验**：直接读 `.vue` 源码，遍历结构 / 逻辑 / 样式 / 安全 / 业务 / 生态 / 数据 各维度规则 | `validate/index.js`（被 cli.js require） |
| `unit/` | **产物单测**：读 `dist/<card>/main.{json,js,mock}`，校验产物结构完整性、形态正确、跨卡一致性 | `unit/index.test.js`（node --test） |
| `e2e/` | **运行时 E2E**：用自研 Cube 引擎实际解释执行产物，模拟生命周期 / 事件 / v-for / 表达式 | `e2e/index.test.js`（node --test） |
| `eslint/` | **代码规范**：ESLint v9 flat config，分两个子配置——`skill.config.mjs`（lint skill 自身 JS）+ `card.config.mjs`（lint 卡片 .vue，覆盖 template/script/style 三段），自定义 `cube/*` 规则在 `plugin.js` | `eslint/index.test.js`（node --test） / `cli.js --lint` |

四层职责**互不重叠、互不引用**：

```
            ┌────────────────────────┐
            │   cli.js 端到端循环     │
            └─────┬──────┬──────┬────┘
                  │      │      │
        ┌─────────▼─┐ ┌──▼───┐ ┌▼─────────┐ ┌──────────────┐
        │ validate/ │ │unit/ │ │ e2e/     │ │ eslint/      │
        │ (源码 AST)│ │(产物)│ │(运行时)  │ │(代码规范)    │
        │ 多维度规则 │ │多维度│ │多维度   │ │vue/*+cube/*+JS│
        └───────────┘ └──────┘ └─────────┘ └──────────────┘
                  │      │      │              │
                  ▼      ▼      ▼              ▼
              report.json / report.md  ←── cli.js 统一汇总
```

`validate/rules/` 按维度分子目录（structure/logic/style/security/business/ecosystem/data），承载各规则的实现；`config/` 负责 yaml 解析 / 卡片清单 / agent 配置；`validate/rules.config.json` 只承担静态规则注册表职责。ESLint 侧真实配置来源是 `eslint/card.config.mjs`。

## 快速开始

### 安装

```bash
# 进入 skill 目录
cd skill

# 安装依赖（仅首次，需要外网或内网 npm 代理）
npm install
```

### 基本用法

```bash
# 默认：act build + 静态校验 + 单元 + E2E + ESLint + 报告
node cli.js

# 跳过编译（产物已存在时）
node cli.js --skip-build

# 只跑某一层
node cli.js --skip-build --stage validate   # 静态校验
node cli.js --skip-build --stage unit       # 产物单测
node cli.js --skip-build --stage e2e        # 运行时 E2E
node cli.js --skip-build --stage eslint     # 代码规范
node cli.js --skip-build --stage card       # 卡片专属测试（agent 生成）

# 只跑指定卡片（任意 stage）
node cli.js --skip-build --stage eslint --card hello-cube,chart-bar

# 独立 SFC lint（不动 node --test 套件）
node cli.js --lint
node cli.js --lint --card hello-cube

# 列出所有启用规则
node cli.js --list-rules

# 写报告（默认同时输出 .json + .md）
node cli.js --skip-build --report ./out/report
```

### Agent 生成卡片专属测试

```bash
# 从 CSV/Excel 生成 case.md（测试用例描述）
node cli.js --agent-gen cases.csv                    # 全量，含 card 列
node cli.js --agent-gen hello-cube                   # 单卡，自动找 test/hello-cube/cases.csv
node cli.js --agent-gen hello-cube --agent-skip-gen  # 只生成 case.md，不调 LLM

# 生成 main.test.js（需要 agent 已启用，详见 config.yaml agent 段）
node cli.js --agent-gen cases.csv --card hello-cube
node cli.js --agent-gen cases.csv --agent-force       # 覆盖已存在文件
```

## 测试分层约定

| 位置 | 内容 | 约束 |
|------|------|------|
| `skill/unit/index.test.js` | 通用跨卡契约（产物结构） | 禁止硬编码卡片名，用 `loadCard(name)` 遍历 |
| `skill/e2e/index.test.js` | 通用跨卡契约（运行时行为） | 同上 |
| `skill/validate/index.test.js` | 通用规则自测 | 不引用任何卡片 |
| `test/<card>/main.test.js` | 卡片专属断言 | 每张卡独立文件，硬编码卡片名合法 |

**新增断言时先判断归属**：
- 断言对所有卡片都成立 → 加到 `skill/` 下的通用测试，用循环变量
- 断言只对某张卡片成立 → 加到 `test/<card>/main.test.js`，硬编码卡片名

新增卡片时，通用测试自动生效，无需修改；卡片专属断言需要手动创建 `test/<card>/main.test.js`。

> **注意**：`src/`（卡片源码）和 `test/`（卡片专属测试）属于**消费 skill 的卡片项目**，不提交到 GitHub（见 `.gitignore`）。Skill 工程对外发布时只包含 `skill/`、`common/`、`env/`、`TODO.md`。

## 评测目标

由 `config.yaml`（skill 根目录）统一登记，**新增卡片零成本**：

```yaml
# skill/config.yaml
cards:
  - hello-cube
  - user-profile
  # ... 其他卡片
```

- `config.yaml`（数据层）+ `config/index.js`（脚本层）协同承担配置职责，详见 `config.yaml` 顶部注释
- 环境变量覆盖路径（生产部署时用）：
  - `CARDS_ROOT` — 卡片项目根目录，默认自动探测 `act-cube/src` 或 `act-cube/cards`
  - `CARDS_SUBDIR` — 卡片源码子目录名，默认自动探测（`cards` 或 `src`）
  - `CARDS_FILTER` — CLI 子集模式（逗号分隔卡片名）
  - `ACT_AGENT_*` — agent LLM 参数（API key / baseURL / model 等，详见 config.yaml.agent 段）

## 四层测试矩阵

| 层 | 目录 | 入口 | 验证内容 |
|----|------|------|---------|
| **0. 静态 DSL 校验** | `validate/` | `index.test.js` | 源码级 AST 校验：覆盖 manifest / 标签 / 属性 / 表达式 / 事件 / v-for / v-if / 生命周期 / 死代码 / 完整性 / XSS / 嵌套 v-for / 业务完备性 / JSDoc / F2 / mpaas API / data 边界 / 交易流程序列图 / common 公共方法 / env 环境配置 / 定时器生命周期清理 |
| **1. 单元（产物结构）** | `unit/` | `index.test.js` | 读取 `main.json` / `main.js` / `main.mock`，验证源代码产物一致性 |
| **2. E2E（运行时）** | `e2e/` | `index.test.js` | 自实现 Cube 引擎解释执行，覆盖加载 / 数据 / 生命周期 / 事件 / v-for / 表达式 / mock / 完整流程 / 性能 / 可访问性 / 安全 / 功能 / 结构唯一 / mock 完整性 / 资源/i18n / 禁用元素 / 密度 |
| **3. ESLint 规范** | `eslint/` | `index.test.js` + `cli.js --lint` | `skill.config.mjs`（skill 工程自身）+ `card.config.mjs`（卡片 SFC，覆盖 template/script/style）+ 自定义 cube/*（no-unknown-lifecycle / no-magic-event / no-shadow-data / no-magic-color-hex / no-hardcoded-secret / no-setinterval-string / no-global-this / no-throw-literal）+ 标准 JS 规则 |

## 内网部署

### 离线安装

```bash
# 1. 有外网的环境：打包依赖
cd skill
npm pack                    # 生成 skill-1.0.0.tgz

# 2. 拷贝到内网
# 将 skill-1.0.0.tgz 和整个 skill/ 目录（不含 node_modules）拷贝到内网

# 3. 内网安装
cd skill
npm install --offline       # 或使用 npm 内网代理
```

### 无 LLM 环境

若内网无法访问 LLM API，可跳过 agent 相关功能：

```bash
# 只用静态校验（不依赖 LLM）
node cli.js --skip-build --stage validate

# 跳过 agent 生成
node cli.js --agent-gen cases.csv --agent-skip-gen
```

### 依赖说明

| 依赖 | 用途 | 是否必需 |
|------|------|---------|
| `espree` | AST 解析（validate/e2e/eslint 共用） | 必需 |
| `vue-eslint-parser` | Vue SFC 解析（validate/eslint） | 必需 |
| `eslint` + `eslint-plugin-vue` | ESLint 校验 | 必需 |
| `yaml` | config.yaml 解析 | 必需 |
| `md5` | 产物哈希 | 必需 |
| `xlsx` | Excel 测试用例读取（agent 功能） | 可选 |

**注意**：除 `npm install` 外，skill 运行时不访问外网。所有知识库文档已内置于 `reference/` 目录。

## 知识库

`reference/` 目录：
- `code-review-checklist.md` — 知识库来源说明（OWASP / SonarJS / eslint-plugin-vue / 阿里 F2 / cube-lint）
- `json-capabilities.md` — JSON 配置能驱动的所有校验能力说明
- `owasp-top10-frontend.md` / `eslint-plugin-vue-rules.md` / `f2-spec.md` / `mpaas-components.md` / `mpaas-styles.md` / `sonarjs-rules-frontend.md`

## 项目结构

```
skill/
├── cli.js                   # 一键运行入口（端到端评测循环）
├── cube-engine/             # 极简 Cube 引擎（AST 解释器，e2e 用）
│   ├── index.js             #   引擎入口（loadCard / createEngine / expandNode）
│   └── expressions.js       #   AST 表达式求值器
├── config.yaml              # skill 唯一 YAML 主登记（cards/agent/rules）
├── package.json             # 依赖
├── validate/                # 静态校验（多维度规则全自包含）
│   ├── index.js             #   校验聚合层（validateCard / validateAll / summarize）
│   ├── index.test.js        #   静态校验测试（反例 + 正向）
│   ├── rules.config.json    #   规则注册表 + severity + options
│   ├── rules.config.schema.json  # rules.config.json 的 JSON Schema
│   └── rules/               #   规则实现（按 7 个维度子目录）
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
│   └── index.test.js        #   引擎解释执行，验证运行时行为
├── eslint/                  # 代码规范
│   ├── plugin.js            #   cube/* 自定义规则（卡片结构专属）
│   ├── skill.config.mjs     #   ESLint 配置（lint skill 工程自身 JS）
│   ├── card.config.mjs      #   ESLint 配置（lint 卡片 .vue SFC）
│   └── index.test.js        #   ESLint 测试套件
├── config/                  # 配置加载器
│   ├── index.js             #   cards / yaml / 路径 / config.yaml 统一 schema 校验
│   ├── config.schema.json   #   config.yaml（cards + agent）的 JSON Schema
│   ├── rules-loader.js      #   validate 规则注册表加载
│   └── agent-loader.js      #   agent 配置加载（yaml 优先）
├── contracts/scaffolder.js  # 自动生成新规则脚手架（输出到 validate/rules/）
├── agent/                   # agent LLM 客户端
│   ├── llm-client.js        #   OpenAI 兼容 POST + 超时控制
│   ├── excel-converter.js   #   CSV/XLSX → case.md
│   └── testgen.js           #   case.md → main.test.js
├── reference/               # 知识库（内网部署友好）
├── REPORT_TEMPLATE.md       # 报告模板
├── REPORT.md                # 最近一次运行结果示例
└── README.md
```

详细技术文档见 `REVIEW.md`（完整评测报告 + 关键发现 + 边界说明）。
