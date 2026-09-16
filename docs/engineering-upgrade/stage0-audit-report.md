# 阶段 0：工程化体检报告（只读）

> 体检时间：2026-09-05 · 方式：6 个并行只读取证代理 + 主会话交叉验证
> 依据：agent-engineering-upgrade 工作流六大域检查清单
> 红线遵守：本阶段未修改任何代码（只读取证）

## 一、缺口矩阵（六大域）

状态图例：✅ 达标 / ⚠️ 部分 / ❌ 缺失

### 域 1：Prompt 资产化 — ⚠️ 部分（成熟度高，一处结构性缺口）

| 检查项 | 状态 | 证据 | 缺失后果 |
|---|---|---|---|
| prompt 集中管理 | ✅ | `packages/server/app/prompts/` 8 个内容模块 + `base.py:26` `PromptTemplate` frozen dataclass；`templates.py:113` `ALL_TEMPLATES` 全局注册表，docstring 明示 "Every prompt sent to an LLM should come from this module" | — |
| 版本标识 | ✅ | 57/57 个 `PromptTemplate` 全部声明 `version=`（100%）；`companion_prompts.py:3-15` docstring 记录 v2→v3 变更依据 | — |
| variables 声明 | ✅ | `base.py:39-63` `__post_init__` 在 import 期校验声明 variables 与占位符漂移（CI 阻断级） | — |
| services/routers 内联 prompt | ⚠️ | Python 侧无内联（`conversation_memory.py:124`、`friend_service.py:95-124` 等全部 `.template.format(...)` 引用）；**但 companion 主 system prompt 存于 `app/translations/{en,zh}.json` 的 `companion.system_prompt`/`socratic_prompt` 键，绕开 PromptTemplate 版本体系**（`context_prompts.py:239-360` 装配） | i18n prompt 改措辞无 version bump 痕迹，靠 trace 的 MD5 hash 兜底（`safe_invoke.py:146-159`） |
| 双端复制 | ✅ | web/mobile/shared TS 源码 grep `"You are"`/`"你是一位"`/`systemPrompt`/`openai|bigmodel|dashscope` 零命中；前端只调自家 `/api/*`（`web/src/lib/api/client.ts:43`） | 单一来源事实上成立（载体是后端） |
| 变更评审记录 | ✅ | `prompt-eval.yml:20-33` 路径触发门禁；`regression_baseline.json` 入 git；`models/llm_trace.py:45` `prompt_version` 落库；`companion_prompts.py` docstring 变更记录 | — |

### 域 2：评测体系 — ⚠️ 部分（L0 齐、L1 半、L2/L3 缺、基线未接线）

| 检查项 | 状态 | 证据 | 缺失后果 |
|---|---|---|---|
| golden set ≥20 | ✅ | `ALL_GOLDEN` 实数 22 条：`golden_companion.py` 6 条 + `golden_services.py` 16 条；`mock_data.py` 22 个 `# last-verified:` 标记交叉验证 | — |
| L0 确定性断言 | ✅ | `assertions.py:27-75` type/not_empty/min_length/contains/not_contains/required_keys/key_types；schema 校验经 pydantic `SCHEMA_MAP`（`eval_runner.py:105-126`） | — |
| L1 golden 回归 | ⚠️ | 包含/禁词断言有（`golden_companion.py:47,113`）；**无精确匹配、无正则断言、无工具调用序列断言**（本项目无 tool-call agent，序列断言 N/A） | 措辞漂移类回归拦不住 |
| L2 LLM-as-judge | ❌ | `app/eval/` 与 `.github/workflows/` grep `judge|rubric` 零命中 | 有用性/事实性维度无覆盖 |
| L3 人工抽检 | ❌ | 无抽检流程/配额文档（仅 `regression_baseline.py:102` 注释提到 human reviewer 语境） | — |
| REGRESSION 门禁 | ⚠️ | `regression_baseline.py:124-155` 五类分类器已实现且 docstring 声称 "blocks merge"，**但 `eval_runner.run_all()` 不调用它、CI 不跑它**（唯一调用方 `tests/test_p41_regression_baseline.py:30`）；基线 15/22 条陈旧（缺 7 条），metadata 仍 `"seed_run": true` | 原 pass 现 fail 的静默回归放行 |
| CI 阻断 | ✅ | `prompt-eval.yml` 三道关卡（rendering 测试/mock eval/AST）无 `continue-on-error`，任一失败即阻断；`ci.yml:110-144` 全量 pytest 含 `test_eval_golden.py` 双保险 | — |
| golden 来源标注 | ⚠️ | expected_output 判分契约成对 ✅；**来源（日志/case 编号）与"防哪类回归"标注 ❌**（仅 3 条自由文本 description） | 评测集腐化无从审计 |
| 漂移扫描 | ⚠️ | `drift-scan.yml` 周跑三模式但全部 `continue-on-error`；`drift_scan.py:13-15` docstring 声称 live 模式比对基线，**实现 `check_live_drift`（:151-178）从未加载基线**——文档与实现不符 | — |

### 域 3：可观测性 — ⚠️ 部分（骨架完整，三处硬伤）

| 检查项 | 状态 | 证据 | 缺失后果 |
|---|---|---|---|
| 调用统一出口 | ✅ | `ChatOpenAI` 仅 `llm/pool.py:107,141` 构造（grep 全仓验证）；流式 `.astream` 两处（`stream_pump.py:64`、`stream_fallback.py:79`）均使用网关对象 | — |
| 结构化调用日志 | ✅ | `observability.py:316-325` `_log_call` 唯一出口：request_id/model/label/latency/tokens/cost/success/fallback/error/prompt_version/ttft/finish_reason/lang/cache_hit/error_type 全字段 | — |
| 错误分类枚举 | ✅ | `observability.py:45-57` 11 类稳定枚举 + `_classify_error`（:60-147）isinstance 优先 | — |
| 落库 | ⚠️ | `llm_call_traces` 表 + `_TraceWriter` 批量写（`observability.py:384-447`）齐全；**致命：`LLM_LOG_ENABLED` 默认 false（`.env.example:59`），`add()` 直接 return（:409-410）→ 默认配置下唯一输出是 stdout** | 指标/回放的地基默认不存在 |
| 指标查询 | ❌ | 五项最小指标：成功率（列存在无端点）、p95 ❌（全仓无 percentile 计算）、token 成本 ⚠️（`llm_log_service.py:126-156` 仅 companion 维度）、失败分类 ⚠️（无聚合端点）、护栏触发率 ❌（`output_filter.py:46-49,68-71` 仅 stdout warning）。`routers/stats.py:22-88` 全是阅读域，零 LLM 维度 | "有数据无看板" |
| badcase 回放 | ⚠️ | 对话类 ✅（`chat_messages` 表含 role/content）；**非对话类 LLM 调用 prompt/输出零留存**（`llm_trace.py`/`llm_log.py` 均无 content 列）；`0018` 迁移加的 `http_request_id` 列全仓 0 处引用（死列） | 非对话 badcase 无法回放定位 |
| trace/span | ❌ | 无 Langfuse/LangSmith/OTel；仅 request_id + provider_attempt_id 两级自研关联，后者只进 stdout 不落库 | — |
| 熔断/重试状态 | ✅ | `GET /api/v1/llm-providers`（`llm_providers.py:64-71`）实时快照；状态迁移全有日志（`circuit_breaker.py:44,60,71,75-78`） | — |

### 域 4：测试策略 — ✅ 基本达标（护栏测试充分，配置与两处覆盖缺口）

| 检查项 | 状态 | 证据 | 缺失后果 |
|---|---|---|---|
| 规模与 mock 纪律 | ✅ | 104 个测试文件、约 1520 个测试函数；`conftest.py:318-322` mock_llm 默认拦截，`test_eval_golden.py:4` 明示 "No real API calls" | — |
| 网关单测 | ✅ | 熔断（`test_p12_half_open_cascade.py`）、重试（`test_p11_retry_after.py`）、fallback 计费（`test_p02_fallback_billing.py`）、safe_invoke（`test_p_native_structured_output.py:161-231`） | — |
| sanitizer 测试 | ✅ | `test_book_field_sanitization.py`（8 条对抗样本参数化 :109-127）+ `test_streaming_llm.py:462-485` | — |
| 注入/PII 护栏 | ✅ | `test_p43_prompt_injection_delimiters.py`（对抗样本 :258,:287）；`test_output_filter.py:22-52` PII + :55-68 有害内容；`test_safety_crisis_gate.py` 危机语中英文 | — |
| 密闭性 | ✅ | `conftest.py:227-254` `_hermetic_redis` 构造器级 patch `redis.asyncio.from_url`（P5.1）；`:257-288` 进程级单例重置 | — |
| 覆盖缺口 | ⚠️ | `services/agent/stream_registry.py` tests/ 零引用；SSE 客户端断连取消无直接测试；无真模型 e2e（smoke 门控的 HTTP e2e 是唯一出口，`test_smoke_endpoints.py:36-39`） | — |
| pytest 配置 | ⚠️ | **`pytest.ini` 与 `pyproject.toml` 双配置冲突**：pytest.ini 优先级更高 → pyproject 的 `addopts --ignore=tests/test_full_paths.py` 失效、`smoke` marker 注册被遮蔽；pytest.ini 定义的 5 个 marker（unit/integration/slow/auth/ai）全库零使用 | 配置漂移温床 |

### 域 5：配置与密钥 — ⚠️ 部分

| 检查项 | 状态 | 证据 | 缺失后果 |
|---|---|---|---|
| .env.example 存在 | ✅ | `packages/server/.env.example` 36 个生效 key + 注释段（LLM_PROVIDERS/SMTP/OSS） | — |
| example 与代码同步 | ❌ | **代码可读但 example 未记载 19 个**：`DB_ECHO`、`EMBEDDING_BASE_URL/API_KEY/MODEL`、`CACHE_DATA_TTL`、`CACHE_RECOMMENDATION_TTL`、`LLM_DAILY_BUDGET`、`LLM_DAILY_TOKEN_BUDGET`、`TPM_ENFORCED`、`LLM_MAX_CONCURRENT_STREAMS`、`LLM_NATIVE_STRUCTURED_OUTPUT`、`DB_POOL_SIZE/MAX_OVERFLOW/POOL_RECYCLE/POOL_TIMEOUT`、`LLM_REASONING_TOKEN_SCALE`、`MAX_LIVE_EVAL_TOKENS`、`PROMPT_EVAL_API_KEY`、`TZ`；**根 `.env.example` 的 `MINIO_*`（行 27-32）与代码实际读取的 `OSS_*`（`config.py:234-239`）脱节** | 按根 example 配置 MinIO 不生效 |
| 密钥入库 | ✅ | `git ls-files` 仅 3 个 example 文件被跟踪；`.gitignore` 规则齐全且 `git check-ignore` 实证生效；全盘无 `*.pem`/credentials | — |
| CI 密钥扫描 | ❌ | 无 gitleaks/trufflehog/detect-secrets（7 个 workflow 逐一核对）；`security-review.yml` 是 Claude AI 评审（SHA 锁定 ✅ 但高熵 token 覆盖不保证，且 key 未配时静默跳过） | 规则型扫描为零 |
| 模型配置化 | ⚠️ | 模型名/provider 链/fallback 顺序/feature 路由全部 env 配置化（`config.py:119-122,138-139`、`registry.py:129-148`，支持热切换 :174-208）✅；**temperature/max_tokens 默认值硬编码**（`pool.py:42-43`）⚠️ | — |

### 域 6：结构与 CI — ✅ 基本达标

| 检查项 | 状态 | 证据 | 缺失后果 |
|---|---|---|---|
| 分层结构 | ✅ | routers(29)/services(49+18 子包)/middleware(9)/models(23)/schemas(21)/prompts(11)/eval/core/utils 职责清晰；services 含 llm/agent/companion/memory_book 等 18 子包；⚠️ `routers/agent.py` 574 行为 AST 检查 EXEMPT | — |
| CI 门禁 | ✅ | `ci.yml` 7 个 job：typecheck/build/ruff/4 个 AST 检查/SQLite+PostgreSQL pytest/alembic 升降级/vitest（PostgreSQL 2026-09-02 起为硬门禁） | — |
| 事故档案 | ✅ | `docs/incidents/` 6 个 P-tag 文件 + README 索引 | — |
| ADR | ❌ | `docs/adr/` 不存在 | 选型决策无沉淀 |
| ops/observability | ❌ | 无顶层 ops/ 目录；无告警规则/看板配置 | — |
| 脚手架模板 | ❌ | 无 cookiecutter/template | 新项目无起点 |
| 基座文件一致性 | ⚠️ | CLAUDE.md（207 行）与 AGENTS.md（189 行）互不链接、内容重叠；AGENTS.md 自述 "Keep under 150 lines" 实际 189 行；`ecosystem.config.cjs`（PM2，`/home/ubuntu/read-pal`）与 deploy.yml（`/home/ubuntu/projects/read-pal`）路径不一致；CHANGELOG 停更于 2026-04-19 | — |

## 二、项目定级

**P1（评测优先）+ P2（观测补齐）并行批次**。

判定依据：
- 有真实部署链路（`deploy.yml` push main → VPS，健康检查失败自动回滚），观测**并非为零**
  （stdout 结构化日志字段完整、trace 表骨架齐全、熔断状态有端点）→ 不属 P0 止血档；
- 改动频繁（git log 近期高频修复 + prompt v3 迭代）且 prompt 变更已有 CI 门禁但
  **REGRESSION 分类器未接线**——评测闭环缺最后一环 → P1 优先；
- trace 落库默认关闭 + 指标无查询端点 → P2 紧随，为 badcase 回灌通道打地基。

## 三、改造批次计划（每批一件事，批间依赖标注）

| 批次 | 内容 | 对应阶段 | 依赖 | 风险控制 |
|---|---|---|---|---|
| B1 | 观测止血：JSONL 落盘通道 + `LLM_LOG_ENABLED` 默认 true + `.env.example` 补 19 key + 根 example MINIO→OSS 修正 + gitleaks CI | 阶段 1 | 无 | 全部 additive 或默认值修正，一键回滚 |
| B2 | Prompt 资产：i18n prompt 内容钉（pin 测试）+ 资产化现状文档化 | 阶段 2 | 无 | 不动 prompt 内容（等价性红线） |
| B3 | 评测闭环：`compare_to_baseline` 接入 `run_all()` + 基线刷新至全量 + `--update-baseline` CLI + 断言扩展（equals/regex）+ golden 条目 guards 标注 + L2 judge rubric 资产 | 阶段 3 | B1（日志为 golden 素材的原则性依赖） | 新断言类型 additive；基线刷新走既有 `update_baseline()` |
| B4 | 五项最小指标：`GET /api/v1/stats/llm` 聚合端点 + 护栏触发计数（Redis 日键）+ 内容捕获开关（回放素材）+ 运维 runbook | 阶段 4 | B1（trace 落库默认开启） | 端点只读；计数 fail-open |
| B5 | 固化：drift_scan live 模式接线基线（修文档-实现不符）+ pytest 配置合并 + ADR×3 + 脚手架模板 + AGENTS.md 回写 + CHANGELOG + 隔离探针 | 阶段 5 | B1-B4 | 探针由未参与改造的子代理执行 |

## 四、证据不足项（标 [未知]，禁止默认"应该没问题"）

- 线上 VPS 实际 `.env` 的 `LLM_LOG_ENABLED` 值（无法从仓库判断，改造按"默认值修正"处理并文档化提醒）。
- `llm_call_traces` 表在生产的实际行数与保留策略执行情况（`LLM_LOG_RETENTION_DAYS` 有配置项，未见清理任务——按遗留项登记）。
