# LLM 监控升级方案（P-A / P-B / P-C 分期）

> 2026-09-18 定稿（参照 Claude Code Router 工作台的三级下钻交互），
> 2026-09-20 落盘。执行状态：**P-A / P-B 已完成（2026-09-20）**。
> P-A：后端 1832 测试全绿；实弹：ops-key 403 门、requests 列表、
> `/{request_id}` 链路下钻（真实 glm 429→mimo 兜底链）、providers
> 快照 `tpmWindowUsed`。P-B：/ops/llm 升级（30d 默认、双趋势图、
> 失败分布、供应商运行时卡 30s 轮询、by_label 增 TTFT/成本/版本列）
> + 新页 /ops/llm/traces（过滤/分页/行展开链路/复制 ID）——浏览器
> 12/12 实弹通过；web 213 vitest 全绿（趋势图为零依赖 SVG，未引库）。
> P-C 未开始。dev 注意：`LLM_LOG_ENABLED` 曾为 false（trace 表
> 09-17 起为空），已改回 true。
>
> 核心判断：read-pal **数据面很全、呈现面极弱**。`llm_call_traces` 落库
> 20 字段（`ttft_ms / fallback_used / prompt_version / lang / cache_hit /
> error_type / finish_reason / book_id` 全部已落库未露出），但无行级
> trace API——线上排障靠 SSH + psql。本方案补的是"看得见"，不是"再采
> 一遍"。

## 零、现状盘点（2026-09-18 已核实锚点）

| # | 现状 | 位置 | 问题 |
|---|------|------|------|
| 1 | trace 落库三路 fan-out（structlog / JSONL / DB） | `app/services/llm/observability/`（`_core/_jsonl/_writer` 包） | 无行级读 API |
| 2 | writer 50 条/5s 批量 flush、6h prune | `observability/_writer` | 正常，不动 |
| 3 | 五指标全表现扫 + 10 万行 cap | `metrics.py:80/96` | p95 超限时失真；>48h 窗口每次全表扫 |
| 4 | 窗口 1–720h；guardrail 硬编码 days=1 | `metrics.py:148` | 无法看多日护栏趋势 |
| 5 | ops-key 常量时比较 | `llm_metrics.py:24-37` | 已修（P7.2 后为 hmac + header）|
| 6 | `/api/v1/logs/llm` 读独立的 `llm_logs` 表 | 仅 companion safety 写入 | 与 traces 不通，**方案不合并**（用途不同） |
| 7 | `_state_snapshot` 未露 TPM 窗口用量 | `llm_providers.py:35-55`；registry 已追踪 "for dashboards"（`registry.py:66-108`） | 限流迫近不可见 |
| 8 | 熔断变迁仅 structlog，无历史 | `circuit_breaker.py` | 无法回看"何时开的闸" |
| 9 | `/api/v1/agent/health` 无鉴权 | routers/agent.py | 公开端点暴露内部状态（单独项，不在本方案内修） |
| 10 | `ops/alerting/check.py` LLM 告警裸 SQL 绕过 metrics.py | check.py | 与指标口径漂移 |
| 11 | llm-metrics.md §4 阈值全部未实现 | 文档 | 告警是纸面的 |
| 12 | `chat_messages` 无 session 实体（仅 user+book 分组） | models | CCR"会话"粒度的对应物是 `http_request_id` 调用链（一次 SSE 内主回答 + 工具循环 + fallback） |
| 13 | ops UI 单页（5 卡片 + by_label 表） | web `[locale]/ops/llm/page.tsx`，i18n `opsLlm` 节 | 无趋势、无下钻 |

## P-A 后端（无 schema 变更）

**目标**：行级排障不再需要 SSH；聚合口径一次成形。

1. **`metrics.py` 增强**（同表现扫，不动写入路径）：
   - `series`：按小时（窗口 ≤48h）或按天（>48h）分桶的 Python 侧分组
     ——调用量 / 成功率 / p95 / 成本四条线；
   - `by_provider` / `by_model` / `fallback_used` 计数；
   - `by_label` 补 `estimated_cost_usd` / `p95_ttft_ms` / `prompt_version`；
   - guardrail 窗口参数化（`guardrail_days`，默认 1 保持现行为）。
2. **行级 trace API**（ops-key header，P7.2 模式抽成共享依赖复用）：
   - `GET /api/v1/stats/llm/requests`——过滤：时间窗 / label / success /
     error_type / request_id 前缀搜索 / user_id 脱敏短哈希；分页
     （`limit≤100, offset`），按 `created_at` 倒序；
   - `GET /api/v1/stats/llm/requests/{request_id}`——同
     `http_request_id` 的**兄弟调用全集**（= 一次 SSE 的完整调用链：
     主回答 + 工具循环 + fallback 重试），含每 span 的 20 字段；
     返回链首摘要（总时延 = max(created_at+latency) − min(created_at)）。
   - 内容字段（prompt/completion 文本）**不返回**——trace 表本就不落
     内容（隐私边界），API 同样只出元数据。
3. **`_state_snapshot` 增强**（`llm_providers.py`）：
   - 补 registry 已追踪的 TPM 窗口用量（`registry.py:66-108`）；
   - 熔断状态变迁 ring buffer（`deque(maxlen=50)`，进程内）：每次
     CLOSED→OPEN→HALF_OPEN 迁移记 `(ts, provider, from, to)`。

**验收**：`curl` 两级 API 能从"今天失败最多的 label"一路下钻到具体
request_id 的完整链路；pytest 覆盖过滤/分页/链聚合/脱敏；现有五指标
返回结构向后兼容（只增字段）。

## P-B 前端

1. **`/ops/llm` 总览升级**：30d 窗口默认；label/provider 过滤；series
   趋势图（复用现有图表组件，或无依赖 SVG——**勿引第三方图表库**）；
   日条带；错误分布；供应商运行时卡（TPM 用量 + 熔断状态，30s 轮询）。
2. **新页 `/ops/llm/traces`**：requests 列表 → 行展开 span 列表（同一
   链路的时间轴列表，暂不做瀑布图）；复制 request_id 一键对接
   badcase-triage-runbook 的回灌流程。

**约束**：en/zh.json 只可增量加 key（此前有未提交改动叠加）；i18n 走
`opsLlm` 既有节。

**验收**：ops 页从聚合到单链路三次点击内完成；无新依赖；vitest 覆盖
过滤与展开。

## P-C 汇总表 + 告警落地

1. **`llm_metrics_rollup` 表**（hour × label × provider 维度）：
   `_TraceWriter` flush 时 upsert（调用量/成功数/token/成本/p95 采样），
   保留 90d；`>48h` 窗口的 metrics 改读 rollup，消除全表现扫；
   alembic upgrade + downgrade 双跑（CI 门）。
2. **check.py 改造**：读 rollup（删裸 SQL）；落地 llm-metrics.md §4
   阈值——成本 7d 翻倍 / error-mix 跳变 >20pp / label 成功率 −5pp 且
   样本 ≥30；digest 附 7 天趋势。
3. 顺手修 `check.py:121` 的 `llm:guardrial:*` 拼写（键名对不上会导致
   告警永远静默）。

**验收**：>720h 窗口查询 <500ms（索引 + rollup）；告警四阈值各有
单测触发样例；downgrade 干净。

## 明确不做（边界）

- 账户余额卡（供应商 API 口径不一）
- 拖拽自定义仪表盘
- 对话回放（内容不落库是隐私边界，API 亦不返回内容）
- 会话级聚合（需产品级 schema 变更，等 session 实体立项）
- 热力图（后置可选）
- `llm_logs` 合并（companion safety 专用通道，保持独立）

## 执行顺序与依赖

P-A（后端 API）→ P-B（前端消费）→ P-C（rollup 是性能债，最后做）。
P-B 依赖 P-A 的 API 形状冻结；P-C 独立于两者，可并行。
