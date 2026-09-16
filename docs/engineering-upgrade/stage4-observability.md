# 阶段 4（B4）：可观测性完善与 badcase 回灌

## 五项最小指标（从「有数据无看板」到「一个端点全查」）

新增 `GET /api/v1/stats/llm?hours=24`（登录态，窗口 1-720h 硬顶）：

| 指标 | 实现 | 备注 |
|---|---|---|
| 任务成功率 | `success_rate`（含缓存行——任务视角缓存即成功） | |
| p50/p95/p99 时延 | Python 侧 nearest-rank（SQLite 测试库无 percentile_cont；窗口有硬顶保护行扫描） | 仅统计非缓存新鲜调用 |
| token 成本 | `tokens.{input,output,total}` + `estimated_cost_usd` 汇总 | |
| 失败分类计数 | `error_breakdown` 按 11 类稳定枚举 group | |
| 护栏触发率 | `guardrail_hits_today.{pii,harmful,total}` | 新计数器（下述） |

附带 `cache_hit_rate` 与 `by_label` Top10（调用量/成功率/p95/token——定位哪个
feature 在烧钱）。实现：`app/services/llm/metrics.py`（session 可注入）+
`app/routers/llm_metrics.py`（thin router，`Depends(get_db)`，过 AST 门禁）。

**session 注入的必要性**：初版直接用 `app.db.async_session`，测试会绕过
conftest 的 get_db override 直连开发者真实 PG——与 Never-rule 7（测试密闭性）
同构的风险，重构后测试全部走 `_TestSession`。

## 护栏触发计数

`app/utils/output_filter.py`：
- `_is_harmful` / `_redact_pii` 两个唯一 chokepoint 计数（harmful / pii）
- 进程内 Counter（每 worker 准确）+ 有事件循环时 fire-and-forget Redis 日键
  `llm:guardrail:YYYYMMDD:{kind}`（TTL 8 天，跨 worker 汇总）
- 计数失败静默（护栏绝不能因打点挂掉）；`read_guardrail_hits(days)` 合并双源

## badcase 回放通道

- 内容捕获：`LLM_TRACE_CAPTURE_CONTENT=true` 时 `capture_llm_content()` 把
  prompt/output 预览（截 800 字）写 JSONL——**只进文件，不进 DB、不进日志流**；
  挂点：主链成功（`circuit_fallback.py`）+ fallback 成功（`provider_fallback.py`），
  两处 messages/response/request_id 同域
- 对话类本就全量落库（`chat_messages` + `ai_feedback` 👎锚点）
- runbook：`ops/observability/badcase-triage-runbook.md`（链路重建 → 四因归因
  → golden 回灌 → 验收判据"该条转绿"）

## 平台选型（人权项，不擅自拍板）

Langfuse/LangSmith 未引入——ADR-0001 记录决策与重开触发条件（回放 10 分钟
定位门禁不达 / 部署形态扩到多服务）。本地 JSONL + PG trace 表先满足回放。

## 验证

`tests/test_llm_metrics.py` 9 项：五指标正确性（含窗口外排除/缓存行剔除口径/
p95 nearest-rank）、空窗口 null 不报错、窗口硬顶、护栏计数（PII/harmful/干净
文本）、端点鉴权与 422 边界、端点返回结构。全绿。
