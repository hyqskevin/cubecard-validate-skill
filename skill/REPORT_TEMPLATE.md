# ACT Cube 评测报告 — 字段说明

> 本文件是 cli.js `--report` 生成的报告**字段说明**，不是运行结果本身。
> 每次运行产出两份报告：
>   - `<base>.json` — 结构化数据（CI 抓取）
>   - `<base>.md`   — 人类可读版（人工 review）
> 同时 skill/out/report.last.json 会保留**最近一次**运行的副本。

## 报告落点

| 文件 | 路径 | 来源 |
|------|------|------|
| 当次 JSON | `<report>.json`（`--report` 参数指定） | `cli.js` 直接生成 |
| 当次 MD | `<report>.md`（同 base） | `cli.js` 直接生成 |
| 最近一次 JSON | `skill/out/report.last.json` | `cli.js` 自动同步（最近一次） |
| skill 设计文档 | `skill/REVIEW.md` | 模板，手维护 |
| skill README | `skill/README.md` | 模板，手维护 |
| skill SKILL | `skill/SKILL.md` | 模板，手维护 |

> **不**放卡片专属报告到 `test/<card>/` 的原因：通用评测循环（validate/unit/e2e/eslint）的报告是 skill 工程级别的产物，跨卡片共享。卡片专属的产物（cases.csv / case.md / main.test.js）已经放到 `test/<card>/`，与 src/ 下的卡片源码分离，不污染 ACT 打包目录。

## JSON 字段

```jsonc
{
  "timestamp": "2026-09-09T05:19:41.277Z",   // 运行时间（ISO）
  "cards": ["hello-cube", "user-profile", ...],  // 本次评测卡片清单
  "buildOk": true,                              // act build 是否成功
  "validate": {                                 // validate/index.test.js 汇总
    "code": 0, "tests": 83, "pass": 83, "fail": 0, "cancelled": 0, "skipped": 0
  },
  "unit": { ... },                              // unit/index.test.js 汇总
  "e2e": { ... },                               // e2e/index.test.js 汇总
  "eslint": { ... },                            // eslint/index.test.js 汇总
  "perCard": {                                  // 卡片专属测试（agent 生成的 main.test.js）
    "hello-cube": { "code": 0, "tests": 1, "pass": 1, "fail": 0, ... }
  },
  "fingerprints": {                             // 产物指纹（md5）
    "hello-cube/main.js": "d41d8cd98f00b204e9800998ecf8427e",
    ...
  },
  "durationMs": 1234                            // 总耗时
}
```

## MD 字段

由 `cli.js#renderReportMarkdown` 渲染，分四节：
1. **各级别汇总**（build / validate / unit / e2e / eslint 表格）
2. **产物指纹 (md5)**（code block）
3. **失败详情**（从 `_rawOutput` 提取的 `not ok` 行）
4. **建议**（全部通过时给"进入下一阶段"；否则给修复建议）

## 报告与设计文档的区分

| 文件 | 类型 | 更新时机 |
|------|------|---------|
| `skill/REVIEW.md` | **设计文档模板**（手维护） | 改 skill 设计时 |
| `skill/README.md` | **使用说明模板**（手维护） | 改 CLI / 目录结构时 |
| `skill/SKILL.md` | **能力说明模板**（手维护） | 改能力范围时 |
| `skill/REPORT_TEMPLATE.md` | **报告字段说明**（手维护） | 改报告结构时 |
| `skill/out/report.last.json` | **最近一次运行结果**（自动生成） | 每次 cli.js --report |
| `<report>.json` / `<report>.md` | **当次运行结果**（自动生成） | cli.js --report 时 |

> 上表中"手维护"的不应混入运行快照；"自动生成"的应在 CI 工件或本地 `out/` 目录里，不进 skill 仓库本身（生产部署时通常 .gitignore）。
