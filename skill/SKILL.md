# ACT Cube 卡片评测 Skill

基于 JS / JSON 产物对源 `.vue` 卡片代码做多维度代码评审的一站式工具。

> 目录位置：`act-cube/skill/`，跟 `act-cube/cards/` 同级。Skill 内部不耦合
> 任何具体卡片名，所有评测目标从 `config.yaml` 读取；
> 卡片源码子目录名（`cards` / `src`）通过 `CARDS_SUBDIR` 环境变量覆盖。

## 配置（config.yaml + config/index.js 协同）

`config.yaml`（数据层）+ `config/index.js`（脚本层）协同承担 skill 配置：

- `config.yaml` 位于 `skill/` 根目录，统一登记 `cards:` 列表 / `agent:` LLM 参数
- `config/index.js` 提供脚本侧能力：yaml 解析 / 卡片清单加载（含 schema 校验）/ 卡片项目根目录探测 / agent 配置入口
- 加载优先级（高 → 低）：环境变量 → `config.yaml`
- ESLint 规则不在 yaml/json 里登记，真实来源是 `eslint/card.config.mjs`

```yaml
# skill/config.yaml
cards:
  - hello-cube
  - user-profile
  # ... 其他卡片
```

生产环境只要替换 `config.yaml` 的 `cards:` 数组即可。

环境变量覆盖：
- `CARDS_ROOT` 默认 `act-cube/cards`（指向卡片项目根，自动探测 `act-cube/src` 或 `act-cube/cards`）
- `CARDS_SUBDIR` 默认 `cards`（每张卡片下的源码子目录，生产可改 `src`）
- `CARDS_FILTER` 子集模式（逗号分隔卡片名）
- `ACT_AGENT_*` agent LLM 参数（详见 config.yaml `agent:` 段）

## 适用场景

- 评审 ACT（AntCubeTool）开发出来的 Cube 卡片是否符合编译产物规范
- 在 CI 中拦截编译器升级 / 源代码改动引入的回归
- 校验 DSL（生命周期、data/methods、表达式）的正确性
- 评审 .vue 源文件风格是否符合 Cube 规范（自定义 ESLint 规则）

## 四层校验职责

skill 按职责切成 4 个独立子目录，**互不重叠、互不引用**：

| 层 | 目录 | 入口 | 内容 |
|----|------|------|------|
| **0. 静态 DSL** | `validate/` | `validate/index.js` + `validate/index.test.js` | 直接读 `.vue` 源码，遍历结构 / 逻辑 / 样式 / 安全 / 业务 / 生态 / 数据 各维度规则 |
| **1. 产物单测** | `unit/` | `unit/index.test.js` | 读 `dist/<card>/main.{json,js,mock}`，校验产物结构完整性 |
| **2. 运行时 E2E** | `e2e/` | `e2e/index.test.js` | 自研 Cube 引擎解释执行产物，覆盖加载 / 数据 / 生命周期 / 事件 / v-for / 表达式 等维度 |
| **3. ESLint 规范** | `eslint/` | `eslint/index.test.js` + `cli.js --lint` | `skill.config.mjs`（lint skill 自身）+ `card.config.mjs`（lint 卡片 SFC）+ 自定义 cube/* + 标准 JS 规则 |

## 能力范围

| 维度 | 类型 | 覆盖 |
|------|------|------|
| 结构完整性 | validate + unit | compilerType/version/meta/struct/style/medias/logic 字段 |
| 节点准确性 | unit | DOM 树、tag、事件、image、v-for |
| 样式准确性 | unit + validate (V11) | 选择器、属性、单位、rpx/%/hex |
| 逻辑准确性 | validate (V4-V9) + unit | data/methods/生命周期、IIFE/ES5/零依赖 |
| 表达式求值 | unit + e2e (E6) | `:value` / `@click` / `v-for` 翻译 |
| Mock 数据 | unit + e2e (E7) | 字段、数组、解析 |
| 跨卡片一致性 | unit | 编译器版本、产物大小 |
| 产物可加载 | e2e (E1) | 实例化、错误日志 |
| 初始数据 | e2e (E2) | data + beforeCreate 联动 |
| 生命周期 | e2e (E3) | beforeCreate/didMount/didAppear 调用顺序 |
| 事件触发 | e2e (E4) | 多事件、多次触发、state 联动 |
| v-for 展开 | e2e (E5) | 展开数量、子节点内容 |
| 表达式求值 | e2e (E6) | 字符串拼接、三元、数组方法 |
| Mock 数据 | e2e (E7) | 解析、合并 |
| 完整流程 | e2e (E9) | 端到端综合 |
| 未知生命周期 | eslint | cube/no-unknown-lifecycle |
| 事件回调禁用 eval | eslint | cube/no-magic-event |
| 基础 JS 规则 | eslint | no-undef / no-eval / prefer-const |
| 业务完备性 | validate (V14) | if/else / 三元 / 未声明 data |
| JSDoc | validate (V15) | 方法/lifecycle 缺注释 |
| F2 图表 | validate (V16) | 必填 props + hex 颜色 |
| mpaas API | validate (V17) | requireModule('mpaas_jsapi') 合法性 |
| data 边界 | validate (V18) | 数组长度 / 对象属性 / 嵌套深度 |
| 交易流程 | validate (V19) | 多接口串行调用 + Mermaid 序列图 |
| common 模块 | validate (V20) | 相对路径引用 + @ 前缀禁用 |
| env 配置 | validate (V21) | `.env.sit/uat/prod` 白名单 |
| 定时器清理 | validate (V23) | setTimeout/Interval 配 didDisappear |
| 嵌套 v-for | validate (V13) | cube 不允许 |
| XSS | validate (V12) | eval/Function/v-html/innerHTML |

## 运行

```bash
# 完整流程：act build + 静态校验 + 单测 + E2E + ESLint
node cli.js

# 跳过 build（产物已存在）
node cli.js --skip-build

# 分阶段
node cli.js --skip-build --stage validate
node cli.js --skip-build --stage unit
node cli.js --skip-build --stage e2e
node cli.js --skip-build --stage eslint
node cli.js --skip-build --stage card       # 卡片专属测试（agent 生成）

# 只跑指定卡片（任意 stage）
node cli.js --skip-build --stage eslint --card hello-cube,chart-bar

# 独立 SFC lint（跳过测试套件）
node cli.js --lint

# 输出报告（json + md）
node cli.js --report out/report
```

### Agent 生成卡片专属测试

```bash
# 从 CSV/Excel 生成 case.md
node cli.js --agent-gen cases.csv                    # 全量，含 card 列
node cli.js --agent-gen hello-cube                   # 单卡，自动找 test/hello-cube/cases.csv
node cli.js --agent-gen hello-cube --agent-skip-gen  # 只生成 case.md，不调 LLM

# 生成 main.test.js
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

## 目录结构

```
skill/                        # 位于 act-cube/skill/，跟 cards/ 同级
├── SKILL.md                # 本文件
├── README.md               # 快速开始 + 职责说明
├── REVIEW.md               # 完整技术评审
├── cli.js                  # 一键入口
├── cube-engine/            # 极简 Cube 引擎复刻（AST 解释器）
│   ├── index.js            #   引擎入口（loadCard / createEngine / expandNode）
│   └── expressions.js      #   AST 表达式求值器
├── config.yaml             # skill 唯一 YAML 主登记
├── package.json            # 依赖（eslint + ajv + espree + vue-eslint-parser）
├── validate/               # 静态 DSL 校验（多维度规则全自包含）
│   ├── index.js            #   validateCard / validateAll / summarize
│   ├── index.test.js       #   正向 + 反例
│   ├── rules.config.json    #   规则注册表 + severity + options
│   ├── rules.config.schema.json  # rules.config.json 的 JSON Schema
│   └── rules/              #   规则实现（按维度子目录）
│       ├── _shared/context.js   #   共享 AST 上下文
│       ├── structure/      #   结构类规则
│       ├── logic/          #   逻辑类规则
│       ├── style/          #   样式类规则
│       ├── security/       #   安全类规则
│       ├── business/       #   业务类规则
│       ├── ecosystem/      #   生态类规则
│       ├── data/           #   数据类规则
│       └── dim-README.md   #   维度说明
├── unit/                   # 产物单测
│   └── index.test.js       #   读 dist 产物，校验结构
├── e2e/                    # 运行时 E2E
│   └── index.test.js       #   引擎解释执行
├── eslint/                 # 代码规范
│   ├── plugin.js           #   cube/* 自定义规则
│   ├── skill.config.mjs    #   lint skill 自身 JS
│   ├── card.config.mjs     #   lint 卡片 .vue SFC
│   └── index.test.js       #   ESLint 测试套件
├── config/                 # 配置加载器
│   ├── index.js            #   卡片清单 + yaml 解析 + 路径 + config.yaml 统一 schema 校验
│   ├── config.schema.json  #   config.yaml（cards + agent）的 JSON Schema
│   ├── rules-loader.js     #   validate 规则注册表加载
│   └── agent-loader.js     #   agent 配置加载（yaml 优先）
├── contracts/scaffolder.js # 自动生成规则脚手架（输出到 validate/rules/）
├── agent/                  # agent LLM 客户端
│   ├── llm-client.js
│   ├── excel-converter.js
│   └── testgen.js
└── reference/              # 知识库（内网部署友好）
```

## 设计哲学

1. **四层职责互不重叠**：validate 读源码、unit 读产物、e2e 解释执行、eslint 静态规范，各层独立演进。
2. **零编译时依赖**：除 Node.js 内置 + ESLint/ajv/espree/vue-eslint-parser/css-tree 外不引入第三方包。
3. **可扩展**：新增卡片 → `config.yaml.cards` 加一行；新增 validate 规则 → `validate/rules/<dim>/V<n>-<name>.js` + `validate/rules.config.json` 注册；新增 ESLint 规则 → `eslint/plugin.js` 实现 + `eslint/card.config.mjs` 启用。
4. **基于产物 + 基于源码双层**：unit/e2e 用 dist 产物（不依赖 .vue 解析），validate/eslint 直接读源码。

## 局限性

- 不能验证真机像素渲染
- 不能验证引擎内部未公开的兼容行为
- 不能验证性能（首屏耗时，e2e 仅做内存级性能采样）

## 维护

新增卡片类型 → 写 .vue + mock.json → 跑 `act build` → 跑 cli.js → 加新单测/E2E

新增 lint 规则 → 在 `eslint/plugin.js` 加 rule → 在 `eslint/card.config.mjs` 注册 → 在 `eslint/index.test.js` 加反向用例

新增 validate 规则 → 在 `validate/rules/<dim>/V<n>-<name>.js` 写 check(ctx,result,cardName) → 在 `validate/rules.config.json` 注册（severity / options / description）→ 在 `validate/index.test.js` 加正向/反例
