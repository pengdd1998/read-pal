# LLM 监控升级方案（P-A / P-B / P-C 分期）

> 2026-09-18 定稿（参照 Claude Code Router 工作台的三级下钻交互），
> 2026-09-20 落盘。执行状态：**P-A / P-B / P-C 全部完成（2026-09-20）**。
> 2026-09-24：GAP 复盘收口（见 §GAP 复盘）；**P-D 原始输入输出查看
> 立项**（见 §P-D——逆转"内容 never DB"为默认关、显式 opt-in、
> 短保留、ops-key 专属）。同日实施完成：0031 迁移 + 双门控捕获
> （含流式 settlement 单点钩子）+ writer 批内去重/ON CONFLICT +
> 内容 prune + `/requests/{id}/content` + TracesBrowser 懒加载展开
> （含 capture_disabled 横幅与四种空态）+ compose/.env.example 穿透
> + 文档四件（AGENTS/llm-metrics/隐私页 s9/本文件）。后端 1857 绿、
> web 219 绿；alembic up/down 由 CI Alembic job 在真 PG 验证。
> P-A：行级 trace API + series/TPM/熔断快照（1832 绿，实弹下钻验证）。
> P-B：/ops/llm 升级 + /ops/llm/traces 下钻页（浏览器 12/12；web 213）。
> P-C：`llm_metrics_rollup`（hour×label×provider，writer 同事务 upsert，
> 90d 保留；>48h 全局窗口读 rollup——实弹 `_source: rollup` 验证；
> alembic 0030 upgrade/downgrade 双跑过）；check.py 落地 §4 三阈值
> （成本 7d 翻倍/rate_limit 占比跳变 >20pp/label 成功率 −5pp 且 ≥30）
> + digest 7 天趋势 + `guardrial` 拼写修复（阈值 SQL 已在真 PG 上
> 种子行验证数学）。后端 1838 绿。p95 为调用加权合并的**趋势级**近似
> （精确值走行级 API）；model 维度不在 rollup（by_model 仅 ≤48h 有值）。
> dev 注意：`LLM_LOG_ENABLED` 曾为 false，已改回 true。
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

## GAP 复盘（2026-09-24，HEAD c2e8daeb）

**落地确认**：P-A/B/C 全部真实在位（229158d8 / 41ba0b2c / 036487b0），
1ce7700c（09-23）补掉 09-21 风险审查两笔 P-C 遗留（跨 worker 首小时
PK 竞争两次重试 `_writer.py:88-111`；历史回填 `scripts/backfill_rollup.py`，
幂等 24h 批）。当日实跑：`test_llm_trace_api` 14 绿 + rollup/metrics
21 绿 + web `TracesBrowser` 6/6 绿。CCR 式「总览聚合 → 请求链下钻 →
供应商运行时」三级结构闭合。

**A 类缺口（值得修）**：

1. **总览页缺 label/provider 维度过滤**——本方案 P-B 承诺过、CCR 概览
   核心交互；现仅 traces 页有 label 过滤，provider 过滤全 UI 缺失。
2. **告警阈值零自动化单测**——check.py 四阈值仅 09-20 人工对真 PG 种子
   行验证，CI（alert.yml）只跑不测；psql 依赖使其难单测，需抽纯函数。
3. **rollup 路径（>48h 全局窗口）无 p95 线**——逐桶 `p95_latency_ms:
   None`（`rollup.py:243`），by_label 的 p95_ttft/prompt_version 同为
   None（`:231-232`）、by_model 为空——而 ops 页默认 720h 恰走此路径，
   日常默认视图即近似视图（已披露口径，但 p95 图空置值得处理：全空隐藏
   或 rollup 增 avg_latency 替代线）。

**B 类偏差（已披露/可接受）**：`fallback` 形状为 `{used,total}` 而非
计数；`request_prefix` 实匹配 `http_request_id`（`trace_queries.py:97`）
而 UI 文案仍写 request_id（应改文案）；check.py 保留裸 SQL（stdlib-only
runner + 1h 新鲜度需精确 p95，口径已注释互引）；阈值#2 收窄为
rate_limit-only + c24≥30 门；trace 路径（≤48h 与用户态）p95 仍受 10 万
行 cap；§4 guardrail-rise 未转正（沿用 guardrail_spike）；">720h
<500ms" 验收无度量痕迹；`w_1h` i18n key 冗余。

**与 CCR 最终对照**：三级下钻 ✅；供应商运行时（熔断/TPM 压力/降级
历史）✅；缓存率一等指标 ✅。CCR 有且仍缺、且未被列入"不做"的仅剩
概览维过滤（→A1）。

## P-D 原始输入输出内容落库与查看（2026-09-24 立项）

> **09-24 开发评审修订已并入**：锚点逐一核实属实；A1（隐私声明按真实
> 增量重写）、A2（保留期补备份层）、A3（防御性 upsert）修正 + 流式
> 捕获点收敛为 settlement 单点，见各小节标注。

**背景**：CCR 观测页最有价值的是「参数/结果」查看器；read-pal 监控页
只有元数据 span。现状锚点（09-24 已核实）：

- 内容捕获 opt-in **JSONL-only**（`_jsonl.py:88-128`，cap 800 字符），
  仅两处调用点且都在非流式成功路径：`circuit_fallback.py:243-249`
  （主路成功）、`provider_fallback.py:228-234`（兜底成功）——message
  列表 + `response.content` 在作用域内；
- **流式主路径（companion 聊天 = 绝大部分调用量）完全无内容捕获**：
  `persist_stream_log` 直写 `_trace_writer` 绕过 `_log_call` 与 JSONL
  （`safety.py:49-60`）；流式聚合文本在 `_stream_with_llm` 的
  `collected_parts`（`stream_pump.py:94-121`）与 `stream_fallback.py:79`
  循环处可得；
- 生产容器 JSONL/内容捕获均未开启（根 docker-compose 不透传
  `LLM_TRACE_*`）；
- 失败路径与缓存命中无内容可存（`safe_invoke.py:216-219,326-329`）。

**决策**：逆转 "file-only, never DB" 为 **默认关、显式 opt-in、短保留、
ops-key 专属**。

### D1 新表 `llm_trace_contents`（alembic 0031，up/down 双跑）

`request_id` String PK（每 LLM 调用 id，span 已暴露 `trace_queries.py:45`）、
`http_request_id`（索引）、`label / model / prompt_version`、
`prompt_text / output_text` Text、`prompt_truncated / output_truncated`
Bool（捕获时判定）、`user_id`、`created_at`（索引，保留期清理）。
同 PR 更新 `tests/services/test_alembic_chain.py:169-180` 的
`known_good_head = ['0031']`。

### D2 配置（`app/config.py`，跟随 `llm_trace_*` 模式 config.py:192-198）

- `llm_trace_content_db: bool = False`（默认关——守住"内容默认不进 DB"）
- `llm_trace_content_chars: int = 20000`（每侧截断；独立于 JSONL 的
  800——排障需要更长上下文）
- `llm_trace_content_retention_days: int = 7`（覆盖周度 L3 抽样窗口；
  **A2 双层口径**：DB 行 7 天 prune，但 C2 异机备份为 pg_dump 每日全量
  + daily/ 7 天、weekly/ 28 天桶侧生命周期（`ops/backup/README.md:12,39`）
  ——内容行在备份介质中最长存活约 4 周，隐私披露须写明两层）

**体量核算**（堵容量疑虑）：上限 40KB/调用（20k 字符 × 2 侧）；Beta
量级 <1k 调用/天 → 最坏 ≤40MB/天、7 天存量峰值 ≤~300MB（平均调用远小
于 cap，实际显著更低），prune 6h 批删——无压力。

### D3 捕获管线（零涟漪）

- 扩展 `capture_llm_content` 内部 fan-out：JSONL 分支（原门控不变）+
  DB 分支（`llm_trace_content_db` 开启时构造行交
  `_trace_writer.add_content()`）。**两个现有调用点一行不改**。
- **补流式路径**（主增量，**09-24 评审 B1 修订：收敛为 settlement 单
  点**）：钩子放 `streaming.py` 的 persist 汇合点（`_persist_with_retry`
  :206-208 处，`messages` :66 与 `collected_parts` :89 均在作用域，
  label='companion.stream' 与 `persist_stream_log` 对齐）——不在
  `stream_pump.py`/`stream_fallback.py` 两个 P0.3 事故敏感文件里各开
  一钩；pump/fallback 顺序互斥执行，单点不会双写。
- **取消/失败的部分输出不捕获**（评审 B2，明示取舍）：`success` 完成
  才截内容；`streaming.py:193-201` 取消路径本就整体跳过 persist，settle-
  ment 在 `finally` 里跑有先例（:182-190），若日后排障需要中断流部分
  文本再立项——不做隐式行为。
- `_TraceWriter`：加 `_content_buf` + `add_content()`（独立门控、独立
  MAX_BUFFER），flush 循环（`:120-126`）随 tick 排空；失败仅告警丢弃，
  与 trace 同策略、绝不阻塞调用路径。**A3 防御性写入**：contents 写入
  用 `ON CONFLICT DO NOTHING`——`request_id` 源头是 `uuid4().hex[:12]`
  （`safe_invoke.py:41`），trace 表该列 String(12) 非唯一，Beta 量级碰
  撞可忽略但 INSERT 撞 PK 抛 IntegrityError 会污染整个 flush 批（同族
  于回填脚本踩过的静默失败教训）。
- `_maybe_prune`（`:142-219`）加 content 表同节奏（6h）批量清理。

### D4 API（router thin，逻辑进 `trace_queries.py`）

`GET /api/v1/stats/llm/requests/{request_id}/content`，
`Depends(require_ops_key)`（X-Ops-Key header，P7.2）。200 →
`{request_id, label, model, prompt_text, output_text, prompt_truncated,
output_truncated, created_at}`（不回 user_id 原值）；404 → body 带
`reason`：`capture_disabled` / `not_found`（含已过保留期）。列表与链
接口零改动（内容懒加载，payload 不膨胀）。

### D5 前端（TracesBrowser 链路面板）

每 span「输入/输出」懒加载展开 → 等宽 pre 两块（输入/输出）+ 复制按钮
（走现有 `copyImpl` seam，规避 jsdom clipboard 陷阱）；truncated 显示
「已截断」徽标；404 按 reason 显示空态（未开启捕获 / 缓存命中 / 失败
调用 / 已过保留期），`capture_disabled` 时页面顶部常驻提示「设置
`LLM_TRACE_CONTENT_DB=true` 后生效」。**空态口径**（评审 B3）：API 只回
`capture_disabled`/`not_found` 两个 reason；「缓存命中 / 失败调用」两
种空态由 span 元数据推导（`cache_hit`/`success` 字段已在 span 载荷落
库），不新增 API 语义。en/zh **只增量**加 ~8 key。

### D6 env 穿透与上线

根 `docker-compose.yml` app 服务加
`LLM_TRACE_CONTENT_DB: ${LLM_TRACE_CONTENT_DB:-false}` + 两个数值旋钮
（对齐 :82-83 现有写法）；两份 `.env.example` 加注释条目。
**启用 = VPS .env 一行 + 重建**（流程同 MAX_EMBEDDING_CALLS 修订）。

### D7 测试清单（SQLite+PG 双绿为验收）

门控 on/off（⚠️ 新 settings 字段必须在 `test_llm_trace_jsonl.py:19-24`
、`test_llm_trace_followup.py` 的 `_settings_mock` **显式 pin**——
MagicMock 自动字段为 truthy 会翻转门控）；truncated 判定；流式 pump
成功路径捕获；writer 排空/失败丢弃/prune；API 200/403/404+reason；
alembic 0031 双跑 + head pin；Web 组件注入 seam 测试（展开加载/空态/
复制/徽标）。

### D8 明确不做（P-D 内）

失败调用的内容（无输出可存）、缓存命中的内容（无真实调用）、整段
会话回放（维持原决策）、内容字段进列表/链接口（只懒加载）。

### 隐私边界声明（评审重点；**09-24 A1 修订——按真实增量表述**）

~~"首次让用户对话内容落 DB"~~ **不成立**：`chat_messages` 本就持久化
用户/助手消息（对话历史）。P-D 的真实增量是三样东西**首次进 ops 可见
遥测**：

1. **原始模型输入**——system prompt + 完整上下文装配（书摘、记忆、
   消毒后的用户文本），此前只存在于调用瞬间的内存；
2. **pre-filter 的模型原始输出**——`collected_parts` 在
   `filter_stream_chunk` 之前收集（`stream_pump.py:94` vs :98/:104），
   被护栏拦下、用户从未看到的文本也会入库（这正是它对排障有价值的原因，
   也是它必须锁死在 ops 遥测层的原因）；
3. **与用户身份的关联路径**（user_id 列，出 API 前仍脱敏）。

四道闸对真实增量依然成立：默认关（env 显式 opt-in）→ 清理双层口径
（**DB 7 天 / 备份介质最长约 4 周**，A2）→ 仅 ops-key 端点可读 →
列表/链接口不含内容、不回 user_id 原值。同 PR 文档同步：AGENTS.md
observability 条目（"file-only, never DB" → 新口径）、llm-metrics.md
内容捕获节，及**既有漂移修正**——隐私页 zh/en.json:2080 `s9_body`
"对话存储在你的本地数据库" 与生产部署形态（VPS 集中库）不符，一并改
准。

## 明确不做（边界）

- 账户余额卡（供应商 API 口径不一）
- 拖拽自定义仪表盘
- 对话回放（~~内容不落库是隐私边界~~ → 09-24 勘误：单调用原始 I/O
  已随 **P-D** 立项落地，内容 DB 存储走 opt-in + 短保留 + ops-key 四道
  闸；**整段会话回放**仍维持不做——流式全文重组属产品级界面，且
  `chat_messages` 无会话实体）
- 会话级聚合（需产品级 schema 变更，等 session 实体立项）
- 热力图（后置可选）
- `llm_logs` 合并（companion safety 专用通道，保持独立）

## 执行顺序与依赖

P-A（后端 API）→ P-B（前端消费）→ P-C（rollup 是性能债，最后做）。
P-B 依赖 P-A 的 API 形状冻结；P-C 独立于两者，可并行。
