# 阶段 1（B1）：LLM 调用收口与最小观测

## 收口验证（体检结论复核）

- `ChatOpenAI` 构造点全仓唯一：`app/services/llm/pool.py:107,141`（网关内）
- 网关外 `.ainvoke/.astream` 仅两处流式泵（`stream_pump.py:64`、`stream_fallback.py:79`），
  均使用网关 `get_llm` 对象，非裸构造 → **无收口漏点，无需补收口**
- 结论：read-pal 的网关形态已超过工作流阶段 1 的要求（自带熔断/重试/降级链/结构化日志），
  本批次聚焦「默认不落库」这一止血点

## 改动清单

| 文件 | 改动 | 类型 |
|---|---|---|
| `app/services/llm/observability.py` | 新增 `_JSONLSink`（`LLM_TRACE_JSONL_PATH` 门控，追加写 JSONL，失败仅告警）；`_log_call`/`_log_cache_hit` 接入 sink | additive |
| `app/config.py` | `llm_log_enabled` 默认 `false→true`；新增 `llm_trace_jsonl_path`/`llm_trace_capture_content`/`llm_trace_capture_chars` | 默认值修正 + additive |
| `packages/server/.env.example` | 补 19 个缺失 key（DB_POOL_* / EMBEDDING_* / LLM_DAILY_* / TPM_ENFORCED / LLM_MAX_CONCURRENT_STREAMS / LLM_NATIVE_STRUCTURED_OUTPUT / LLM_REASONING_TOKEN_SCALE / MAX_LIVE_EVAL_TOKENS / PROMPT_EVAL_API_KEY / TZ 等） | 配置同步 |
| 根 `.env.example` | MINIO_* → OSS_* 修正（原 6 个 key 代码从未读取） | 缺陷修复 |
| `.github/workflows/secret-scan.yml` | gitleaks 规则型密钥扫描（PR+push main 阻断） | 新增 CI 门禁 |
| `tests/test_llm_trace_jsonl.py` | sink 门控/JSON 行格式/ts 截获/写失败不抛 + 内容捕获开关/截断/仅文件通道 | 新增测试（10 项） |

## JSONL 记录 schema（对照工作流要求）

`timestamp(ts) | label(≈agent/task) | prompt_version(≈prompt_hash) | model |
prompt_tokens/input | completion_tokens/output | latency_ms | success |
error_type(error_class 固定枚举 11 类) | cost | cache_hit | fallback_used | provider`

对照工作流「字段缺一不可」：**params（temperature/max_tokens）未记录**——trace 表无此列，
.threading 需要动 DB schema，登记为遗留项（见 final-summary）。

## 红线遵守

- 未改任何 prompt 内容与 agent 业务逻辑（只动"怎么记录"）
- 未引入观测平台 SDK（本地 JSONL，平台选型走 ADR-0001 决策暂缓）
- 密钥零出现在代码字面量与日志字段

## 验证

- `tests/test_llm_trace_jsonl.py` 10 项 + 既有 `test_p42_observability.py`/`test_llm_trace.py` 全绿
- 全量套件 1665 passed
