# read-pal 工程化改造（Agent Engineering Upgrade）

> 依据工作流：`/Volumes/ExternalDisk/archive-prompt/workflows/agent-engineering-upgrade.md`
> 改造窗口：2026-09-05 · 执行方式：ZCode 全链委托（阶段 0 只读 + 阶段 1-5 分批改造）
> 本目录 = 改造过程的完整留痕 + 最终交付文档

## 文档索引

| 文档 | 内容 | 对应工作流阶段 |
|---|---|---|
| [stage0-audit-report.md](stage0-audit-report.md) | 六大域缺口矩阵（路径:行号证据）+ 项目定级 + 批次计划 | 阶段 0 体检 |
| [stage1-llm-gateway.md](stage1-llm-gateway.md) | LLM 调用收口验证 + JSONL 最小观测 + 密钥卫生 | 阶段 1 止血 |
| [stage2-prompt-assets.md](stage2-prompt-assets.md) | Prompt 资产化核对 + 等价性验证 + i18n prompt 版本钉 | 阶段 2 资产化 |
| [stage3-evals.md](stage3-evals.md) | 评测体系：基线接线、断言扩展、golden 标注、L2 rubric | 阶段 3 评测 |
| [stage4-observability.md](stage4-observability.md) | 五项最小指标端点 + 护栏计数 + badcase 回放通道 | 阶段 4 观测 |
| [stage5-gates-and-template.md](stage5-gates-and-template.md) | 门禁固化 + ADR + 脚手架模板 + 隔离探针报告 | 阶段 5 固化 |
| [execution-log.md](execution-log.md) | 逐动作执行留痕（时间序） | 全程 |
| [final-summary.md](final-summary.md) | 最终汇总报告（DoD 对照 + 遗留清单） | 汇总 |

## 项目定级结论（阶段 0 产出）

**P1（评测优先）→ P2（观测补齐）**。read-pal 已有真实部署（deploy.yml → VPS），
但观测并非为零（structlog 结构化日志 + trace 表骨架齐全），不属于"P0 止血"档。
缺口集中在：trace 落库默认关闭、指标无查询端点、REGRESSION 基线未接线、
prompt i18n 通道绕过版本体系、密钥扫描缺失。详见体检报告。

## 最终状态（2026-09-05 收官）

- DoD 六项全部交付，隔离探针 4/4 ✅（基座自足性验收通过）
- 全量验证：ruff clean · AST×4 OK · pytest 1665 passed · mock eval 36/36 + 0 regressions
- 总报告：[final-summary.md](final-summary.md)（含遗留清单 8 项，均已路由）
