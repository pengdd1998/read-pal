# read-pal 工程化改造 · 最终汇总报告

> 工作流：agent-engineering-upgrade（绞杀者模式，阶段 0-5）
> 执行：2026-09-05 · ZCode 全链委托 · 过程留痕见 [execution-log.md](execution-log.md)

## 一、DoD 对照（工作流六项产出）

| # | 工作流 DoD | 交付 | 状态 |
|---|---|---|---|
| 1 | 工程化体检报告（缺口矩阵+定级+批次） | [stage0-audit-report.md](stage0-audit-report.md)：六大域 30+ 项逐项 路径:行号 证据 | ✅ |
| 2 | LLM 网关收口 + 每次调用带 trace | 收口本已达标（`pool.py` 唯一构造点）；补齐：JSONL 落盘通道、`LLM_LOG_ENABLED` 默认 true、内容捕获（回放素材） | ✅ |
| 3 | Prompt 资产库 + 评审规则 | 资产库本已达标（57/57 versioned）；补齐唯一缺口：i18n prompt 内容钉（CI 阻断级评审门禁） | ✅ |
| 4 | golden ≥20 + 分层金字塔，L0/L1 进 CI | 22 条 + L0/L1（补 equals/regex）+ **基线 REGRESSION 门禁接线** + L2 judge rubric + L3 SOP | ✅ |
| 5 | 五项最小指标看板 + badcase 回灌通道 | `GET /api/v1/stats/llm`（成功率/p95/token 成本/失败分类/护栏触发率 + by_label 下钻）+ 护栏计数器 + 四因归因 runbook | ✅ |
| 6 | 结构模板 + AGENTS.md 回写 | `templates/agent-service/`（探针 ❌ 清零后发布）+ AGENTS.md 4 处回写 + ADR×3 + CHANGELOG | ✅ |

**验收门禁**：隔离探针（未参与改造的子代理）4/4 ✅ —— 详见 [stage5-gates-and-template.md](stage5-gates-and-template.md)。

## 二、代码改动总账

**新增（9 文件）**：`app/eval/judges.py`（L2 rubric）、`app/services/llm/metrics.py`、
`app/routers/llm_metrics.py`、`.github/workflows/secret-scan.yml`、
4 个测试文件（JSONL sink / prompt pins / eval gate / metrics，共 41 项测试）、
`ops/observability/` 三份 runbook、`templates/agent-service/`、`docs/adr/` ×3。

**修改（14 文件）**：网关三件（observability/circuit_fallback/provider_fallback——
全部 additive 挂点）、eval 四件（eval_runner/assertions/golden_dataset/live_runner）、
config.py（默认值+3 新配置）、output_filter.py（护栏计数）、main.py（路由注册）、
drift_scan.py（live 接线基线）、pytest.ini（合并）、.env.example ×2、
AGENTS.md、CHANGELOG.md。

**刷新**：`regression_baseline.json` 15→36 条（消除 seed_run 陈旧态）。

**零改动声明**：`app/prompts/**` 与 `app/translations/**` 内容零变更
（阶段 2 等价性红线）；agent 业务逻辑零改动（阶段 1 红线）。

## 三、验证总账

| 验证 | 结果 |
|---|---|
| `ruff check app/` + drift_scan.py | All checks passed |
| AST 门禁 ×4（router-thin / no-raw-book-fields / file-length / encapsulation） | 全 OK |
| 全量后端 pytest | **1665 passed + 8 skipped**（178s，SQLite hermetic） |
| mock eval（含基线门禁） | 36/36 passed，0 regressions，exit 0 |
| drift-scan 三模式 | mock-freshness OK / template-consistency 报 2 个既有 dead-export（预存发现，非本次引入）/ live 无 key 跳过 |
| 隔离探针 | 4/4 ✅，AGENTS.md 217 行（≤300） |

## 四、红线与人权项遵守

- 搬家不改内容：无迁移发生，prompt 内容零变更 ✅
- 未引入观测平台（Langfuse/LangSmith 选型 = 人权项，ADR-0001 记录决策与重开条件）✅
- 未删任何 golden 条目、未设任何阈值豁免 ✅
- 无双端 prompt 漂移取舍（不存在双端复制）✅
- 无 PII 原文入库（内容捕获默认关、只进文件、截断）✅
- 资金护栏：L2 judge 与 live eval 均 token 上限 + 显式 opt-in ✅

## 五、遗留清单（诚实登记，均有路由）

| 项 | 原因 | 路由 | 状态（2026-09-05 遗留批次） |
|---|---|---|---|
| JSONL 无 `params`（temperature/max_tokens）字段 | trace 表无此列 | **已解决**：params 线程化到全部调用路径，仅进 JSONL（免迁移） | ✅ |
| `user_id/book_id` 不进 trace 表 + `http_request_id` 死列 | 列缺失/模型未声明 | **已解决**：迁移 0029 + 模型补声明 + contextvar 接线 | ✅ |
| `llm_call_traces` 无清理任务 | 有配置无消费方 | **已解决**：`_TraceWriter._maybe_prune`（6h 检查，retention<=0 永留） | ✅ |
| golden 条目历史来源标注不可考 | 编造来源违反纪律 | 新条目按 runbook 带 case 编号（持续纪律，非一次性动作） | 🔄 运行期 |
| VPS 实际 `.env` 的 `LLM_LOG_ENABLED` 值未知 | 仓库外状态 | **已缓解**：启动时 false 即打 warning 指明后果；部署时仍需人工确认 | ⚠️ 半闭环 |
| 跨项目共享资产抽取 | 单仓库收益为负 | 第二个 agent 项目出现时启动 | ⏸ 按设计搁置 |
| `stream_registry` 零测试、SSE 取消无直接测试 | 体检既有缺口 | **已解决**：+20 项测试（注册/取消/cross-worker 五分支/pubsub fan-out/pump 取消传播） | ✅ |
| `ecosystem.config.cjs`（PM2 遗留） | 部署历史残留 | **已解决**：文件删除 + CLAUDE.md 引用清理（历史档案文档保留） | ✅ |

## 六、运行期循环（改造后生效的日常纪律）

1. **badcase 回灌**：指标端点/👎反馈 → 四因归因 runbook → 脱敏进 golden set
   （guards 标注）→ 修复 PR 让该条转绿；
2. **变更纪律**：改 prompt / 换模型 / 调参数 → mock eval（基线门禁）→ 报告贴 PR
   → intentional 才 `--update-baseline`；
3. **周检**：drift-scan（mock 新鲜度 / dead exports / live 基线 diff）出 issue
   即按 AGENTS.md 触发条件走 harness-review；
4. **抽检**：每周/发版前按 L3 SOP 抽样，judge 与人工背离触发 rubric 修订。

## 七、一句话结论

read-pal 的工程基座原本就在水准线上（网关收口、prompt 版本化、AST 门禁、
密闭测试皆备），本次改造做的是**闭环与默认值**：把"有实现没接线"的回归门禁
接上、把"默认关闭"的观测打开、把"绕过版本体系"的 prompt 钉住、把"有表无端点"
的指标查出来——并以隔离探针 4/4 ✅ 验证了新会话仅凭基座文件即可正确执行全部
工程化流程。
