# LLM 可观测性操作手册（engineering-upgrade B1/B4）

> 五项最小指标 + 回放素材通道。先于一切花哨看板——平台服务于回放定位，不是目的。

## 一、五项最小指标

**端点**：`GET /api/v1/stats/llm?hours=24`（需登录态；`hours` 1–720）

| 指标 | 返回字段 | 数据来源 |
|---|---|---|
| 任务成功率 | `success_rate`（含缓存命中行——缓存行天然成功，属任务视角） | `llm_call_traces.success` |
| p95 时延 | `latency_ms.p95`（另有 p50/p99；**仅统计非缓存新鲜调用**，缓存行 ~0ms 会压低分位） | `llm_call_traces.latency_ms` |
| token 成本 | `tokens.{input,output,total}` + `estimated_cost_usd` | trace 表 tokens 列 + 成本估算 |
| 失败分类计数 | `error_breakdown`（11 类稳定枚举，见 `observability.py::_ERROR_CATEGORIES`） | `llm_call_traces.error_type` |
| 护栏触发率 | `guardrail_hits_today.{pii,harmful,total}`（跨 worker：Redis 日键；进程内 Counter 兜底） | `output_filter` 计数器 |

附带：`cache_hit_rate`、`by_label`（调用量 Top10 的成功率/p95/token——定位哪个 feature 在烧钱）。

**前提**：`LLM_LOG_ENABLED=true`（2026-09-05 起为默认值；显式设 false 会使 trace 表为空）。

## 二、JSONL 落盘通道（B1）

`LLM_TRACE_JSONL_PATH=/path/llm_traces.jsonl` 时，每条 `llm_call` / `llm_cache_hit`
记录追加一行 JSON（字段同 trace 表 + `ts`）。与 `LLM_LOG_ENABLED` 互相独立——
DB 关着也能开文件通道。查询示例：

```bash
# 最近 1 小时失败分类分布
jq -r 'select(.ts > now-3600 and .success == false) | .error_type' llm_traces.jsonl | sort | uniq -c

# 某 label 的 p95（粗算）
jq -r 'select(.label == "companion.stream" and .success) | .latency_ms' llm_traces.jsonl | sort -n | awk '{a[NR]=$1} END {print a[int(NR*0.95)]}'
```

## 三、内容捕获（badcase 回放素材，B4 / P-D）

两个独立 opt-in 通道（`capture_llm_content` fan-out，可分别开启）：

1. **JSONL**（B4）：`LLM_TRACE_CAPTURE_CONTENT=true` 且 JSONL 通道开启时，
   prompt/output 预览（截断至 `LLM_TRACE_CAPTURE_CHARS`，默认 800）以
   `event=llm_content` 行写文件——不进日志流。
2. **DB**（P-D，2026-09-24）：`LLM_TRACE_CONTENT_DB=true` 时写入
   `llm_trace_contents`（每侧截断 `LLM_TRACE_CONTENT_CHARS` 默认 20000，
   保留 `LLM_TRACE_CONTENT_RETENTION_DAYS` 默认 7 天，随 trace prune 同
   6h 节奏清理）。**含流式主路径**（`companion.stream` settlement 单点
   钩子）：prompt 含 system prompt + 完整上下文装配，output 为
   **pre-filter 原始输出**（被护栏拦下的文本也在内——这正是排障价值所
   在）。读取仅 ops-key：`GET /stats/llm/requests/{id}/content`，列表/链
   接口不含内容、不回 user_id 原值。

⚠ 两个通道都含用户文本。隐私口径（两层保留）：DB 行 7 天 prune，但
pg_dump 备份（daily/ 7 天 + weekly/ 28 天）中最长存活约 4 周。只在实际
排障期开启；对话调用本身有 `chat_messages` 留存，此开关服务的是原始
模型 I/O（含上下文装配与 pre-filter 输出）的回放。

## 四、告警建议（人工阈值，先观察一周再定）

- `success_rate`（24h）跌破基线 −5pp
- `error_breakdown.rate_limit` 占比突增（供应商配额问题早于用户报障）
- `guardrail_hits_today.total` / 调用量 上升（输出质量退化的前兆信号）
- `estimated_cost_usd`（24h）环比翻倍
