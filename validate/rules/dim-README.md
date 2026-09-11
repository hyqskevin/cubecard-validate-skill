# validate/rules/ 维度说明

> 23 条静态校验规则（V1-V23）按"评测维度"分组，每组一个子文件夹。新增规则时**先决定维度**，再放进对应子文件夹。

## 维度划分

| 维度 | 文件夹 | 职责 | 规则数 |
|------|--------|------|--------|
| **结构** | `structure/` | 卡片文件结构、模板/属性/生命周期白名单 | 6（V1/V2/V3/V8/V10/V22）|
| **逻辑** | `logic/` | 表达式、事件、v-for / v-if 解析逻辑 | 5（V4/V5/V6/V7/V9）|
| **样式** | `style/` | CSS 词法校验 | 1（V11）|
| **安全** | `security/` | XSS、注入、危险 API | 1（V12）|
| **业务** | `business/` | 业务约定（嵌套 v-for / 业务完备 / JSDoc）| 3（V13/V14/V15）|
| **生态** | `ecosystem/` | 外部生态（图表 / mpaas / common / env / 定时器）| 5（V16/V17/V20/V21/V23）|
| **数据** | `data/` | data 边界 / 业务流程 | 2（V18/V19）|
| **共享** | `_shared/` | 跨维度共享的 ctx 构造器 | 0（仅 context.js）|

## 文件命名

- `V{id}-{short-name}.js` 例如 `V12-xss.js` → 放在 `security/V12-xss.js`
- 每个文件 export `{ check, ...helpers }`
- 规则 ID（V12）和文件名前缀必须一致，方便按 ID 反查维度

## 注册表对应

`validate/rules.config.json` 里每条规则的 `module` 字段必须用 `./validate/rules/<dim>/V<id>-<name>` 形式（相对仓库根）：

```json
{
  "id": "V12",
  "module": "./validate/rules/security/V12-xss",
  "severity": "error",
  "enabled": true,
  "options": { ... }
}
```

## 新增规则流程

1. **决定维度**（structure / logic / style / security / business / ecosystem / data）
2. 创建 `validate/rules/<dim>/V{id}-<name>.js`，export `check(ctx, result)`
3. 在 `validate/rules.config.json` 注册（severity / options / description）
4. 在 `validate/index.test.js` 加正向 / 反向测试
5. 在 `reference/code-review-checklist.md` 登记
6. 用 `node cli.js --list-rules` 验证注册成功

## scaffolder

CLI 提供自动脚手架：

```bash
node cli.js --scaffold rule V24-xxx-name --severity warning --description "..."
# 自动创建 validate/rules/V24-xxx-name.js 模板 + 更新 validate/rules.config.json
```

（注意：scaffolder 目前会放在 `validate/rules/` 根目录，需要手动移到子文件夹；后续会增强。）

## 反向加载顺序

CLI 默认按 `validate/rules.config.json` 数组顺序加载。如果想让"安全 > 业务 > 数据"这种优先级生效，把 severity=error 的规则排在前面。