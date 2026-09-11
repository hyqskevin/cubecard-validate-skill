# SonarJS 关键规则 · 前端归档

> 整理自 SonarJS 官方 ESLint 插件（`eslint-plugin-sonarjs`）规则集，针对**前端（含 ACT Cube 卡片）**视角，筛选最相关的安全 / 健壮性 / 复杂度规则，
> 每条给出：描述、对应的防御方案、使用清单（基于本 Skill 的 V*/cube-* 规则或 ACT DSL 实践）。
>
> - 抓取日期：2026-09-10
> - 来源：https://www.npmjs.com/package/eslint-plugin-sonarjs
> - 官方 RSpec 索引：https://sonarsource.github.io/rspec/  （每条规则的官方详情可在 RSPEC 链接访问）
> - 本 Skill 已实现的部分等价规则：**V12**（XSS/eval/Function）、V17（mpaas API）、V22（text 不可嵌套）、ESLint `cube/*` 自定义、no-var/prefer-const 全局校验。

---

## 一、安全与加密（Security & Cryptography）

| 规则 ID | 描述 | 对应方案 | 使用清单 |
|---------|------|----------|----------|
| **S1523** `code-eval` | 动态代码执行不应使用用户控制数据（`eval` / `new Function` / `vm.runInXxx`） | 使用宿主白名单 API；参数化数据；服务端校验 | ACT 卡片脚本禁 `eval` / `new Function`（V12 已覆盖）；`setTimeout('string',)` / `setInterval('string')` 也禁用 |
| **S2077** `sql-queries` | SQL 查询不应动态拼接 | 参数化查询 / ORM / 存储过程；ESAPI；输入校验 | ACT 是单文件 SFC，不直接拼 SQL；但任何宿主 RPC 不应拼接原始 SQL；前端展示时不要拼接 log/数据 |
| **S4721** `os-command` | OS 命令不应通过 shell 解释器执行（child_process.exec 等） | 使用 spawn/execFile + 参数数组 | 卡片禁用 `process` / Node API（V12 关联），调用原生能力走宿主 |
| **S2076** 等同 ESLint `no-eval` | 禁止 eval | 替换为白名单 API | 已在 V12 + ESLint `no-eval: error` 覆盖 |
| **S5148** `link-with-target-blank` | `window.open` 不带 `noopener` 可能被钓鱼 | 加 `noopener,noreferrer` | 卡片内禁用 `window.open`；跳转走宿主 `cube.navigateTo` |
| **S4507** `production-debug` | 生产环境不应启用调试（`debugger` / console） | CI 检测；prod build 删除 | 卡片用 `console.log` 调试 OK，但 PII 数据不进 console（V12 + A09 防御） |
| **S2245** `pseudo-random` | PRNG（`Math.random`）不应在安全场景使用 | 用 `crypto.getRandomValues` | 卡片不做 token 生成；若做，禁用 `Math.random` |
| **S4790** `hashing` | 不应使用弱哈希（MD5、SHA1） | 用 SHA-256/384/512 或 Argon2/bcrypt（密码） | 卡片不做密码哈希；上传摘要需用强哈希 |
| **S5547** `no-weak-cipher` | 不应使用弱加密算法（DES/RC4/MD5） | AES-GCM、SHA-256+ | 卡片禁用任何原生加密 API |
| **S5542** `encryption-secure-mode` | 加密应使用安全 mode（不用 ECB） | AES-GCM、ChaCha20-Poly1305 | 同上 |
| **S4426** `no-weak-keys` | 加密 key 应足够强 | RSA ≥ 2048，ECC ≥ 256，HMAC ≥ 256 位 | 同上 |
| **S5659** `insecure-jwt-token` | JWT 应使用强算法签名/验证 | RS256/ES256/EdDSA | 卡片不签发/验证 JWT |
| **S3330** `cookie-no-httponly` | Cookie 应有 HttpOnly 标记 | 服务端 `Set-Cookie: HttpOnly` | 卡片不操作 cookie |
| **S2092** `insecure-cookie` | Cookie 应有 Secure 标记 | HTTPS-only | 同上 |
| **S3330 / S5728** `content-security-policy` | CSP fetch 指令不应被禁用 | 加 CSP：default-src 'self' | 服务端响应头；卡片引用外链需在 CSP 白名单 |
| **S5739** `strict-transport-security` | HSTS 不应被禁用 | 响应头 `Strict-Transport-Security: max-age=...` | 服务端配置；卡片 url 必须 https（V11 已部分覆盖） |
| **S5730** `no-mixed-content` | CSP 应阻断混合内容（HTTPS 页加载 HTTP 资源） | 全部 https；CSP block-all-mixed-content | V11 强制 https；卡片 url() / image src 必须 https |
| **S5736** `no-referrer-policy` | Referrer-Policy 应设置安全值 | `no-referrer-when-downgrade` 等 | 服务端配置；卡片跳转带 `referrerpolicy="no-referrer"` |
| **S5728** 同上 `content-security-policy` | 同 | 同 | 同 |
| **S4502** `csrf` | CSRF 防护不应被禁用 | CSRF token / SameSite cookie | 卡片表单/支付走宿主 mpaas API，宿主保证 |
| **S5122** `cors` | CORS 策略应只授信可信源 | 白名单 Origin；禁用 `*` + credentials | 卡片不直接配 CORS；服务端按域白名单 |
| **S5332** `no-clear-text-protocols` | 不应使用明文协议（HTTP/FTP） | 全部 https；HSTS | V11 强制 https；url 必须 https://（已禁 http/file/data:） |
| **S5693** `content-length` | HTTP 请求 body 长度应限制 | 服务端校验 + 客户端分片 | 上传/下载走宿主；卡片不直发 fetch |
| **S2755** `xml-parser-xxe` | XML parser 不应有 XXE 漏洞 | 关闭 DTD/external entities | 卡片不解析 XML；如必须，用安全的 DOMParser |
| **S4830** `unverified-certificate` | SSL/TLS 连接应验证服务端证书 | TLS + 验证 | 卡片不直连，宿主保证 |
| **S5527** `unverified-hostname` | 应验证主机名 | TLS + 校验 hostname | 同上 |
| **S4423** `weak-ssl` | 不应使用弱 SSL/TLS 协议 | TLS 1.2+ | 服务端配置 |
| **S5443** `publicly-writable-directories` | 临时文件不应在公开可写目录 | `/tmp` 外 | 卡片不写本地文件；上传走宿主 |
| **S5689** `x-powered-by` | 不应泄露版本信息 | 删 `X-Powered-By` 头 | 服务端配置 |
| **S6418** `no-hardcoded-secrets` | 密钥不应硬编码 | 走 env/config | ACT V20 + 卡片脚本禁硬编码密钥/token/appKey |
| **S2068** `no-hardcoded-passwords` | 密码不应硬编码 | 同上 | 同上 |
| **S6437** `hardcoded-secret-signatures` | 不应硬编码凭证（含私钥、token 等） | env / KMS | 同上 |
| **S1077** `alt-text`（jsx-a11y） | img 应有 alt | 无障碍 + SEO | 卡片 `<image>` 必须给 `mode` + 可选 alt |
| **S7639** `review-blockchain-mnemonic` | 钱包助记词不应硬编码 | 用户输入 | 卡片不用 |
| **S2036** `no-globals-shadowing` | 标识符不应被覆盖 | 局部变量遮蔽全局 | 卡片不引入全局 |

## 二、注入与代码执行（Injection & Code）

| 规则 ID | 描述 | 对应方案 | 使用清单 |
|---------|------|----------|----------|
| **S5147**（含 SonarJS `code-eval`） | 不应使用 `eval` / `new Function` | 白名单 API | **V12 + cube/no-magic-event** 已覆盖 |
| **S5247** `disabled-auto-escaping` | 模板引擎自动转义不应被禁用 | 保持模板自动转义 | 卡片模板默认转义，不要 `v-html`（V12 已覆盖） |
| **S5725** `disabled-resource-integrity` | 远程资源应带 integrity 校验 | SRI hash | 卡片 `<image>` 等资源由宿主管理，不直接走 `<script src>` |
| **S8479** `dompurify-unsafe-config` | DOMPurify 配置不应可绕过 | 用 allowedTags/allowedAttrs 白名单 | 卡片不直接用 DOMPurify（V12 禁 v-html 已规避） |
| **S6268** `no-angular-bypass-sanitization` | Angular 自动 sanitize 不应被禁用 | 用 DomSanitizer 严格配置 | 与 ACT 卡片无关，跳过 |
| **S7790** `dynamically-constructed-templates` | 模板不应动态拼接 | 用静态模板 | 卡片模板静态声明，不用 JS 字符串拼接 |
| **S2757** `non-existent-operator` | 不应使用 `=+`、`=-`、`=!`（实为赋值非比较） | 用 `===` / 显式 | ESLint `no-extra-bind` 等价 |
| **S2626** `wrong-syntax-for-for-in` | `for-in` 应正确过滤原型 | `if (Object.prototype.hasOwnProperty.call(obj, k))` | 卡片数据来自宿主，可不遍历对象属性 |
| **S6092** `chai-determinate-assertion` | chai 断言只能单原因成功 | 避免歧义断言 | 卡片不带测试逻辑，跳过 |

## 三、错误处理与可靠性（Error Handling & Reliability）

| 规则 ID | 描述 | 对应方案 | 使用清单 |
|---------|------|----------|----------|
| **S1481** `no-unused-vars` | 局部变量/函数未使用 | 删除 | ESLint 标准规则已开 |
| **S1854** `no-dead-store` | 未使用的赋值应删 | 删除 | 卡片脚本活代码，无 dead store 风险 |
| **S2486** `no-ignored-exceptions` | 不应忽略 catch | 至少日志/重抛 | 卡片 `.catch(err => toast.error(...))` 不能吞错（V12 周边） |
| **S2486** / **S2486** | catch 不空 | 显式处理 | 同步 |
| **S2486** `no-ignored-exceptions` | 不应忽略 `throw` | 重抛或加上下文 | 同上 |
| **S3699** `no-use-of-empty-return-value` | void 函数返回值不应被用 | 不依赖 void 函数的 return | 卡片禁用 `console.log` 返回值（用 console.log 直接调用） |
| **S2201** `no-ignored-return` | 无副作用函数的返回值不应忽略 | 必须接收 | `JSON.parse(...)` 必须接收或显式丢弃 |
| **S2201** | 同 | 同 | 同 |
| **S2737** `no-useless-catch` | catch 不应只 rethrow | 至少加日志/上下文 | 卡片 try/catch 至少 log |
| **S3984** `no-unthrown-error` | `new Error()` 但不 throw 视为可疑 | `throw` 或返回 | 卡片中 `new Error` 直接 throw |
| **S4822** `no-try-promise` | 不应用 try/catch 包裹 promise 失败 | 用 `.catch` 或 await 上下文 try/catch | 卡片中 async 链推荐 .catch，不要 try/await/promise |
| **S3696** `no-throw-literal` | 不应 throw 字符串/undefined | throw new Error(msg) | 卡片 throw 规则 |
| **S3776** `cognitive-complexity` | 函数认知复杂度不应过高 | 拆分函数 | 卡片 methods 控制在 V14 阈值 |
| **S1541** `cyclomatic-complexity` | 圈复杂度不应过高 | 拆分 | 同上 |
| **S138** `max-lines-per-function` | 单函数行数 | 拆分 | 卡片 methods 拆小 |
| **S104** `max-lines` | 文件行数 | 拆分 | 卡片 main.vue 控制在合理大小 |
| **S134** `nested-control-flow` | 控制流嵌套深度 | 早返回 / 拆分 | 卡片 methods 用早返回 |
| **S1067** `expression-complexity` | 表达式复杂度 | 拆分 | 卡片避免三元嵌套 >2 层（V14 已覆盖） |

## 四、API 与 Promise 用法

| 规则 ID | 描述 | 对应方案 | 使用清单 |
|---------|------|----------|----------|
| **S4125** `valid-typeof`（改进 ESLint） | `typeof` 不应使用非法值（typo） | 字符串常量 | 卡片 typeof 用 `'string'/'number'/...` |
| **S3757** `operation-returning-nan` | 算术运算不应产生 NaN | 显式校验 | 卡片金额计算显式校验非 NaN |
| **S3758** `values-not-convertible-to-numbers` | 不可转 number 的值不应参与比较 | 显式 parse | 卡片金额输入校验 |
| **S3760** `non-number-in-arithmetic-expression` | 算术操作数应为数字 | Number() 显式转换 | 同上 |
| **S4634** `prefer-promise-shorthand` | Promise 应使用简写 | `async/await` 优于 `.then` 嵌套 | 卡片方法能用 async/await |
| **S4328** `no-implicit-dependencies` | 依赖应显式声明 | import + package.json | V20 + V21 已强制 |
| **S2428** `prefer-object-literal` | 用对象字面量不用 `new Object()` | `{}` | ESLint 通用规则 |
| **S3504**（同 ESLint `no-var`） | 不使用 var | const/let | 全局规则已开 |
| **S3353**（同 ESLint `prefer-const`） | 优先 const | const/let | 全局规则已开 |

## 五、面向前端的可达性 / 表单 / 资源（部分）

| 规则 ID | 描述 | 对应方案 | 使用清单 |
|---------|------|----------|----------|
| **S5264** `object-alt-content` | `<object>` 应提供替代内容 | 提供 alt + text | 卡片不用 object |
| **S1077** `alt-text`（jsx-a11y） | `<img>` 应有 alt | 提供 alt | 卡片 `<image>` 给 `mode`；无障碍 |
| **S1082** `mouse-events-have-key-events` | 鼠标事件应配键盘事件 | 加 keydown/click 双绑 | 卡片交互组件都要同时支持 click + key |
| **S5256** `table-header` | `<table>` 应有 `<th>` | 加 th | 卡片不用 table（数据列表用 cell 列表组件） |
| **S5260** `table-header-reference` | `<td>` 应有 headers 引用 | headers 属性 | 同上 |
| **S6790** `react/no-string-refs` | 不应用字符串 ref | callback ref | 卡片不用 React |

## 六、测试相关（前端 E2E/单测）

| 规则 ID | 描述 | 对应方案 | 使用清单 |
|---------|------|----------|----------|
| **S2699** `assertions-in-tests` | 测试应包含断言 | 加 expect/assert | 卡片仓库 E2E 测试必备断言 |
| **S5958** `test-check-exception` | 测试应检查具体异常类型 | `toThrow('xxx')` | 同上 |
| **S8784** `assertions-in-test-cases` | 断言应在 test case 内 | 嵌套在 `it(...)` | 同上 |
| **S6092** `chai-determinate-assertion` | chai 断言单原因 | 避免歧义断言 | 同上 |
| **S2925** `no-fixed-wait-in-tests` | 测试不用固定 sleep | 显式等待/轮询 | E2E 用 polling，不用 setTimeout |
| **S1607** `no-skipped-tests` | 测试 skip 应有原因 | `it.skip(reason, ...)` | 同上 |
| **S2187** `no-empty-test-file` | 测试文件至少 1 个 case | 至少 1 个 it | 卡片测试不能空 |

---

## 七、本 Skill 已覆盖的等价规则（对照速查）

下表给出 SonarJS 关键规则与本 Skill 已实现规则的对应，避免重复实现：

| SonarJS | 本 Skill 规则 / 实现 | 说明 |
|---------|---------------------|------|
| S1523 `code-eval` | **V12** + ESLint `no-eval`/`no-new-func` | 禁 eval/Function |
| S5247 `disabled-auto-escaping` | **V12** | 禁 v-html |
| S3776 `cognitive-complexity` | **V14** | if/else/三元嵌套 |
| S2068 / S6418 `hardcoded secrets` | V20 common 模块约束 + 卡片脚本禁硬编码 | 审查时人工核 |
| S5332 `no-clear-text-protocols` | **V11** | url 必须 https:// |
| S3504 `no-var` / S3353 `prefer-const` | ESLint 全局规则已开 | 已升级所有卡片 |
| S1684 `no-globals-shadowing` | cube/no-shadow-data | method 内 var 遮蔽 data |
| S5730 `no-mixed-content` / S5728 CSP / S5736 referrer | 跨业务，需服务端配合 | 不在卡片侧 |
| S4721 `os-command` | 卡片禁用 | 走宿主 |

> **结论**：SonarJS 通用规则集中大部分适用于 Web 全栈项目，对 ACT Cube 卡片这种"业务单文件 + 走宿主"形态而言，核心安全相关（eval/XSS/HTTPS/CSRF/SQL/HTTP 头）已有 V12、V11、V22 覆盖；其余"代码质量/复杂度/可达性"规则建议在宿主 SDK 或测试工程统一接入 ESLint，本 Skill 不重复落地。

## 八、对 ACT 卡片工程集成建议

1. **CI 阶段跑 ESLint + `eslint-plugin-sonarjs`**（仅对 review/SDK 目录）
   ```
   import sonarjs from 'eslint-plugin-sonarjs';
   export default [
     sonarjs.configs.recommended,
     // 加上业务规则
   ];
   ```
2. **卡片目录只跑本 Skill 自有 ESLint 规则**（no-var/prefer-const + cube/* 自定义）
3. **常见隐患清单**（卡片 Code Review 时人工/工具检查）：
   - [ ] 无 `eval` / `Function` / 字符串动态执行
   - [ ] 无 `v-html` / `innerHTML` / `outerHTML` 写入
   - [ ] 无硬编码密钥/token/appKey
   - [ ] 无明文 HTTP 资源（含 `url("http://...")`）
   - [ ] 无 `Math.random` 用于安全场景
   - [ ] 无 `window.open` 跳第三方
   - [ ] 错误处理统一 `toast` 上报，不吞
   - [ ] 用户输入只走 `{{}}`/`:value` 数据绑定，不拼到属性/style/url
   - [ ] 第三方跳转走宿主 `cube.navigateTo`

## 来源
- 官方 npm 规则清单：https://www.npmjs.com/package/eslint-plugin-sonarjs
- RSpec 规则索引：https://sonarsource.github.io/rspec/
- SonarJS 仓库：https://github.com/SonarSource/SonarJS