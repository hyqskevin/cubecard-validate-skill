# OWASP Top 10 2021 · 前端安全归档

> 本文从 OWASP 官方 Top 10 2021 抓取整理，针对**前端（含 ACT Cube 卡片）视角**给出描述、防御方案与使用清单。
> 对应 Skill 规则：V12（XSS / 注入）、V17（mpaas API）、V22（text 不可嵌套），及 ESLint cube/* 自定义规则。
>
> - 抓取日期：2026-09-10
> - 官方入口：https://owasp.org/Top10/
> - ACT DSL 是**单文件 SFC**，无 SQL/OS 命令面，主要威胁面在 JS 执行 + HTML 注入 + 客户端 API + 跨域 + 鉴权 + 数据完整性。

---

## A01:2021 – Broken Access Control（访问控制失效）

### 描述
访问控制执行"用户只能在授权范围内操作"。失效常导致越权读/改/删他人数据、执行超出权限的业务。常见形态：
- 违反最小权限 / 默认拒绝：资源应仅授权给特定角色，实际开放给所有人
- 通过修改 URL（参数篡改、强制浏览）绕过检查
- 不安全的直接对象引用（IDOR）：`?id=xxx` 直接传他人 ID
- API 缺 POST/PUT/DELETE 鉴权
- JWT 元数据被篡改以提权
- CORS 错配：允许不可信源跨域调用 API
- 未登录访问需认证的页、已登录访问需管理员权限的页

### 防御方案
- 默认拒绝（除公开资源外）
- 访问控制机制复用一次，全应用一致；最小化 CORS
- 模型层强制资源所有权（基于用户身份判断是否能读/写）
- 域模型层实施业务限制
- 关闭目录列表；.git、备份文件不进 web 根
- 记录访问失败、适时告警
- API / 控制器限速，减小自动化攻击面
- 服务端会话登出后失效；JWT 短时长，长时 JWT 用 OAuth 撤销
- 单元/集成测试覆盖访问控制

### 前端 / ACT 卡片使用清单
- 任何跳转、查看详情、操作前先判断权限（`userId` / `role` / `vip` 等），不可信客户端
- URL 不放敏感 ID；如必须，**服务端二次校验**
- &lt;a&gt; 链接若跳第三方，验证目标域名白名单（防 Open Redirect CWE-601）
- 内部 RPC 不暴露给前端调用，所有调用走宿主 mpaas API
- ACT 卡片内禁止拼接接口 URL 当 form action；走宿主导航能力

---

## A02:2021 – Cryptographic Failures（加密失效）

### 描述
"敏感数据暴露"是表象，根因是加密机制失效。包括：
- 明文传输（HTTP、SMTP、FTP）
- 使用旧/弱算法（MD5、SHA1、PKCS#1 v1.5）
- 默认/硬编码/复用密钥；密钥管理/轮换缺失
- 未强制 HTTPS，缺 HSTS 等安全头
- 证书链校验缺失
- IV 忽略/重用，ECB 模式
- 密码当密钥用，缺 PBKDF 派生
- 随机数用非 CSPRNG
- 错误信息泄露密钥/填充信息（Padding Oracle）

### 防御方案
- 按隐私法/合规要求对数据分级
- 不必要的敏感数据不要存，用 PCI DSS 合规的 tokenization / truncation
- 静态敏感数据全部加密
- 用 TLS + 前向保密密码套件；HSTS 强制 HTTPS
- 敏感响应禁用缓存
- 密码用 Argon2 / scrypt / bcrypt / PBKDF2 加盐哈希
- IV 用 CSPRNG 生成；同一密钥下不可重用
- 用 AEAD 加密（认证加密）
- 密钥随机生成，密码通过 KDF 派生
- 不用 MD5/SHA1/PKCS#1 v1.5 等废弃算法
- 独立验证配置有效性

### 前端 / ACT 卡片使用清单
- 所有 `url(...)` 必须是 https://（ACT V11 已在 style 段校验）
- 卡片脚本中不出现密钥、密码、token；不写硬编码 appKey/secret
- 卡片间跨域跳转用宿主 mpaas API，禁用拼接第三方 URL
- 表单提交走宿主加密通道（如支付），不要在卡片内直连裸 HTTP
- 错误展示给用户时去掉堆栈/内部错误码（防 CWE-209 / CWE-537）

---

## A03:2021 – Injection（注入）

### 描述
用户输入未经验证/过滤/转义即进入解释器，导致恶意代码执行。常见：
- **XSS（CWE-79）**：HTML/JS/SQL/LDAP/OS/EL/OGNL 注入
- ORM 注入、HQL 注入
- 不可信数据拼接动态 SQL/命令/存储过程
- 自动化检测：所有参数/header/URL/cookie/JSON/SOAP/XML 输入

### 防御方案
- **首选安全 API**：参数化接口 / ORM / 避免解释器
- 服务端正向白名单校验（白名单不是完整防御）
- 残留动态查询：使用解释器特定转义语法
- SQL 结构（表名/列名）不能转义，用户提供的结构名有风险
- CI/CD 集成 SAST / DAST / IAST 自动检测
- 源代码 review 是检测注入最有效的方法

### 前端 / ACT 卡片使用清单
- 卡片脚本禁用：`eval(...)` / `new Function(...)` / `setTimeout/setInterval` 传字符串（V12 已禁）
- 卡片模板禁用：`v-html`（V12）；用 `text` 或 `external-richtext` 承载用户内容
- 用户输入只在文本节点插入，不要拼到属性、style、url(...)、onclick=
- 数据绑定 `{{ }}` / `:value` 默认转义，不要绕开
- 模板里不允许 `onclick="..."` 这类 HTML 事件属性（V12 防御性扫描）
- 客户端 API 走 `requireModule('mpaas_jsapi')`，禁止动态拼接 module 名（CWE-94 Code Injection）

---

## A04:2021 – Insecure Design（不安全设计）

### 描述
"缺失或无效的控制设计"。注意区分：
- **不安全设计**：根本就没设计防御（如用"安全问题+答案"做身份验证）
- **不安全实现**：设计正确但代码写错

不安全设计无法靠完美实现修复，因为所需的控制根本没建。

### 防御方案
- 建立安全开发周期（SDL），AppSec 早期介入
- 维护安全设计模式库 / "paved road"
- 关键流程（认证、鉴权、业务逻辑）做威胁建模
- user story 阶段嵌入安全语言和控制
- 各层（前端→后端）做合理性检查
- 单元 + 集成测试验证关键流程抗威胁
- 按暴露和防护需要做分层 / 多租户隔离
- 限制资源消耗（按用户/服务）

### 前端 / ACT 卡片使用清单
- 业务关键流程做完整用例 + 误用例分析（V14 已部分覆盖 if/else、三元嵌套）
- 强校验：金额、时间、数量上下限（V18 覆盖 data 边界）
- 涉及支付的流程必须做幂等校验、不依赖客户端唯一性
- 关键操作需服务端二次确认，不依赖前端校验
- 失败状态（支付失败/库存不足）必须显式处理（避免静默错误）

---

## A05:2021 – Security Misconfiguration（安全配置失效）

### 描述
应用各层（栈/云/网络/服务器）安全加固缺失或不当。常见形态：
- 任意层缺加固；云服务权限过宽
- 不必要功能/端口/账户/示例页面未关闭
- 默认账户未改密码
- 错误堆栈泄露给用户
- 升级系统后没启用新安全特性
- 框架/库/数据库未设安全值
- 缺安全响应头（HSTS、CSP、X-Frame-Options 等）
- 软件过期/有漏洞

### 防御方案
- 自动化、可复用的加固流程；开发/QA/生产用不同凭证
- 最小化平台：移除不必要功能/示例/文档
- 周期性复审配置；CSP/HSTS 等安全头
- 分段架构 + 网络 ACL
- 自动化验证所有环境的配置

### 前端 / ACT 卡片使用清单
- `<image>` / `url(...)` 必须 https，禁用 http/file/data: 资源（V11 已部分校验）
- 错误信息只给最终用户友好提示，详细日志通过宿主 console/埋点上报
- 卡片不内置调试入口；不在 console 输出敏感数据（手机号、token）
- 模板上不使用 `:src="userInput"` 这类直传用户输入的 URL
- `<image>` 不支持 SVG（V11/官方 image 说明），避免 SVG XSS 风险

---

## A06:2021 – Vulnerable and Outdated Components（脆弱和过期组件）

### 描述
使用存在已知漏洞/已停止维护/已过期的组件（OS、web 服务器、DBMS、框架、库）。你可能不知道：
- 自己用了哪些组件（包括嵌套依赖）
- 哪些组件是有漏洞/过期/不再维护
- 定期扫描漏洞 + 订阅公告
- 不能及时按风险更新

### 防御方案
- 移除不必要依赖
- 持续盘点版本（client + server）+ 用 OWASP Dependency Check / retire.js / SCA 工具
- 订阅 CVE / NVD 公告
- 仅从官方源 + 安全链接获取组件；优先签名包
- 不可维护组件考虑虚拟补丁

### 前端 / ACT 卡片使用清单
- 卡片项目锁定依赖版本（package-lock.json）
- CI 跑 npm audit / Snyk / retire.js
- 禁止 `*` / `latest` 浮动版本依赖
- 卡片里 `requireModule('mpaas_jsapi')` 之外的动态加载禁止（CWE-94，CWE-829）
- 监视客户端 SDK 版本（AntV F2、@antv 系列等）的安全公告

---

## A07:2021 – Identification and Authentication Failures（身份/认证失效）

### 描述
用户身份确认、认证、会话管理失效。包括：
- 凭证填充（credential stuffing）/ 暴力破解攻击
- 默认/弱口令（如 admin/admin）
- 弱口令恢复（"知识问答"）
- 明文/弱哈希存储口令
- 缺 / 弱多因素认证
- 会话 ID 暴露在 URL
- 登录后重用会话 ID
- 登出/闲置后未失效会话

### 防御方案
- 多因素认证
- 不部署默认凭证
- 弱口令检查（top 10000 弱口令）
- 密码策略对齐 NIST 800-63b
- 注册/找回/API 统一返回信息，防账户枚举
- 限制/递增延迟登录失败
- 服务端随机高熵会话 ID；不在 URL；登出/闲置/超时失效

### 前端 / ACT 卡片使用清单
- 登录/支付/密码找回场景，错误信息统一返回（防枚举）
- 不在 URL 拼接 token / session
- 卡片跳转登录页时清掉敏感 data，避免在内存驻留
- 长时间不操作自动跳登录或二次确认
- 不打印日志到用户可见的 toast（V12 顺带）

---

## A08:2021 – Software and Data Integrity Failures（软件和数据完整性失效）

### 描述
对更新、关键数据、CI/CD 缺乏完整性校验。包括：
- 来自不可信源/仓库/CDN 的插件/库
- 不安全的 CI/CD 引入恶意代码
- 自动更新无完整性校验（可被替换）
- 不安全的反序列化：序列化对象被攻击者查看/修改

### 防御方案
- 用数字签名验证软件/数据来源与完整性
- 只从可信仓库拉依赖；高风险场景自建已知良好仓库
- 用 OWASP Dependency Check / CycloneDX 验证组件
- 代码/配置变更走审核流程
- CI/CD 严格权限控制 + 完整性保护
- 不向不可信客户端发送未签名/未加密的序列化数据

### 前端 / ACT 卡片使用清单
- ACT 卡片主产物（main.js / main.bin）需从 mPaaS 控制台签名后下发
- 卡片内部禁用 `JSON.parse(...)` 解析不可信序列化数据后再执行（防原型链污染 / 反序列化攻击）
- 禁用 `eval(JSON.stringify(obj))` / `vm.runInXxx` 之类动态执行
- 宿主 IPC 数据要在卡片侧校验 schema，不要盲信
- 自动更新必须用宿主 mpaasJsapi 的版本管理能力

---

## A09:2021 – Security Logging and Monitoring Failures（日志/监控失效）

### 描述
无法检测、升级、响应活跃攻击。包括：
- 登录/失败登录/高价值交易无审计日志
- 告警/错误日志不充分
- 应用/API 日志未监控
- 日志仅本地存储
- 告警阈值/响应流程不当
- DAST 扫描、渗透测试未触发告警
- 无法实时检测活跃攻击
- 日志/告警泄露给用户（也是 A01）

### 防御方案
- 登录/鉴权/服务端输入校验失败要带用户上下文记录，保留足够长
- 日志格式易被日志系统消费
- 日志数据正确编码防注入
- 高价值交易用 append-only 表等审计追溯
- DevSecOps 团队建立有效监控+告警
- 建立/采用 IR 计划（NIST 800-61r2+）
- 开源方案：OWASP CRS、ELK

### 前端 / ACT 卡片使用清单
- 支付/登录/失败等关键事件走宿主埋点 API（不要 console.log）
- 错误统一上报，不在 toast 把内部错误码/堆栈呈现给用户（V12）
- 卡片行为可观测：didAppear/didMount 触发时可记录曝光埋点
- 数据脱敏上报（手机号/订单号中间位用 `*`，不要原文上报）
- `console.log` 在 ACT 卡片里允许但仅用于调试（用 act debug 看），不输出 PII

---

## A10:2021 – Server-Side Request Forgery（SSRF）

### 描述
应用获取远程资源时未校验用户提供的 URL，导致构造请求到意外目标（即使有防火墙/VPN/ACL）。
- 端口扫描内部服务器
- 敏感数据暴露（file://、localhost 服务）
- 读取云元数据 `http://169.254.169.254/`
- 攻击内部服务造成 RCE/DoS

### 防御方案
- **网络层**：分段隔离远程资源访问；deny by default 防火墙；记录所有放行/拒绝
- **应用层**：URL schema/端口/目标**正向白名单**；不把原始响应返回客户端；禁用 HTTP 重定向；防 DNS rebinding 和 TOCTOU
- **不要用 deny list 或正则**（攻击者会用各种 payload 绕过）

### 前端 / ACT 卡片使用清单
- 卡片禁止自己发 HTTP 请求到任意 URL；统一走 `requireModule('mpaas_jsapi')` 的 `rpc` 等受控方法
- 禁止 `<image src="javascript:...">` 或 `url("http://localhost/...")` 这种用户可控 URL
- 图片资源来自后端下发或运营配置，不接受用户输入 URL 渲染
- 所有外部资源 https 强制（V11）

---

## 附录：ACT 卡片对应规则速查

| OWASP 项 | 主要前端风险 | 卡片对应规则 / 实践 |
|----------|-------------|---------------------|
| A01 访问控制 | 越权查看他人订单、绕过权限 | 卡片不做鉴权，全部委托宿主 mpaas API |
| A02 加密失效 | http 资源、明文 token 上报 | V11 强制 https；脚本禁出现密钥 |
| A03 注入 | XSS / eval / Code Injection | **V12**（XSS、eval、Function、v-html）+ `cube/no-magic-event` |
| A04 不安全设计 | if/else 缺省、关键流程漏分支 | V14 业务完备、V18 data 边界 |
| A05 配置失效 | http 资源、错误堆栈、调试入口 | V11 url 必须 https；调试走 act debug |
| A06 脆弱组件 | 浮动依赖、过期库 | npm audit / 锁版本；V17 限制 module 名 |
| A07 认证失效 | 登录信息泄露、账户枚举 | 错误信息统一（登录/支付场景） |
| A08 完整性失效 | 反序列化、`eval(JSON.parse(...))` | V12 禁 eval；JSON.parse 不可信数据要校验 schema |
| A09 日志监控 | 错误堆栈输出、PII 上报 | V12 + 宿主埋点；中间字段 `*` 化 |
| A10 SSRF | 用户输入 URL 直渲 | 走宿主 RPC；V11 url 必须 https；不接受用户 URL |

## 来源
- A01–A10：https://owasp.org/Top10/A0X_2021-*/ （每项对应页）
- ASVS：https://owasp.org/www-project-application-security-verification-standard/
- Cheat Sheet：https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html