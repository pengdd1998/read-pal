# 执行留痕（时间序）

> 每个动作一条记录：时间(UTC+8) | 批次 | 动作 | 结果/验证

## 阶段 0：工程化体检（只读）

- 14:00 | S0 | 主会话建立任务清单（8 项 todo），确认仓库结构（4 包 monorepo + 7 个 workflow）
- 14:05 | S0 | 并行派出 6 个只读取证代理（prompt 资产化 / 评测 / 可观测性 / 测试 / 配置密钥 / 结构 CI），各自返回 路径:行号 级证据
- 14:20 | S0 | 主会话交叉验证关键结论：
  - `grep ChatOpenAI(` 全仓仅 `app/services/llm/pool.py:107,141` 构造（网关收口 ✅）
  - `grep .ainvoke/.astream` 网关外仅 `stream_fallback.py:79`、`stream_pump.py:64` 两处流式泵（用网关对象，非裸构造）
  - 亲读 `observability.py`/`eval_runner.py`/`regression_baseline.py`/`assertions.py`/`config.py`/`output_filter.py`/`provider_fallback.py`/`safe_invoke.py`/`circuit_fallback.py` 确认代理结论
- 14:35 | S0 | 产出 [stage0-audit-report.md](stage0-audit-report.md)：缺口矩阵（六大域 × 逐项状态+证据+后果）、定级 P1+P2、批次计划 B1-B5

## 阶段 1（B1）：收口验证 + JSONL 落盘 + 密钥卫生

- 14:50 | B1 | 收口验证通过（见上）；`config.py`：`llm_log_enabled` 默认 true + 3 个 trace 新配置项
- 14:55 | B1 | `observability.py`：`_JSONLSink`（路径门控/追加写/失败静默）接入 `_log_call`/`_log_cache_hit`；`capture_llm_content()`（开关门控+截断+仅文件）
- 15:00 | B1 | `circuit_fallback.py` + `provider_fallback.py` 两条成功路径挂内容捕获
- 15:05 | B1 | `.env.example`（server）补 19 key；根 example MINIO_*→OSS_* 修正；`secret-scan.yml`（gitleaks）新建
- 15:10 | B1 | `tests/test_llm_trace_jsonl.py` 10 项测试 → **50 passed**（含既有观测测试）

## 阶段 2（B2）：prompt 资产化核对

- 15:20 | B2 | 结论：无需迁移（57/57 versioned、双端零复制）；唯一缺口 = i18n prompt 无版本纪律
- 15:25 | B2 | `tests/test_translation_prompt_pins.py`：4 条 sha256 内容钉 + 占位符 parity（en/zh × system/socratic）→ **10 passed + 2 skipped**

## 阶段 3（B3）：评测闭环

- 15:35 | B3 | `assertions.py` +equals/regex；`eval_runner.py` 基线接线（REGRESSION 阻断）+ `--update-baseline`/`--judge` CLI
- 15:45 | B3 | `golden_dataset.py` guards 注入（22/22，含一次 key 对照修正——先按臆测 key 写映射，`import 验证` 发现 14 条 miss 后按实际 service/action 修正）
- 15:55 | B3 | `judges.py` L2 rubric（版本化+反谄媚+对账式程序）；live_runner 接 `output_text` 捕获与 `--judge`；rubric JSON 示例花括号转义修复（`{{`）
- 16:05 | B3 | 基线刷新 36 条；mock eval 复跑 36/36 + 0 regressions + exit 0；`test_eval_baseline_gate.py` 12 项 → 全绿

## 阶段 4（B4）：五项最小指标 + 护栏计数

- 16:15 | B4 | `output_filter.py` 护栏计数（chokepoint 计数 + Redis 日键 + 内存兜底 + read 聚合）
- 16:25 | B4 | `services/llm/metrics.py` + `routers/llm_metrics.py` + main.py 注册
- 16:35 | B4 | **测试密闭性修正**：初版 metrics 直用 `app.db.async_session` → 测试直连开发者真实 PG（违反密闭性）；重构为 session 注入 + 路由 `Depends(get_db)`（顺带符合 router-thin 惯例）
- 16:45 | B4 | `test_llm_metrics.py` 9 项（p50 nearest-rank 期望值、token 汇总口径、token key 名三处修正后）→ 全绿
- 16:50 | B4 | `ops/observability/` 三份 runbook：llm-metrics.md / badcase-triage-runbook.md（四因归因+回灌）/ manual-review-sop.md（L3）

## 阶段 5（B5）：固化

- 17:00 | B5 | `drift_scan.py` live 模式接线基线（修文档-实现不符）；三模式回归验证通过
- 17:05 | B5 | `pytest.ini` 合并为唯一事实源（补 addopts ignore + smoke marker；pyproject 同步从属）
- 17:10 | B5 | ADR ×3（观测栈选型 / 评测分层与基线门禁 / pytest 配置合并）；`templates/agent-service/` 脚手架；AGENTS.md 回写 4 处（prompt 变更流程+基线刷新、观测架构图、badcase 章节、secret-scan 行）；CHANGELOG [Unreleased]

## ⚠ 事故与恢复（如实记录）

- 17:20 | B5 | **误回滚事故**：`ruff --fix app/ scripts/ tests/` 波及 ~40 个无关文件（CI 只 lint app/）；随后构造回滚清单时 `/tmp/revert.txt` 被 zsh noclobber 挡住覆盖，`xargs git checkout` 吃进陈旧清单，**把本改造全部已跟踪改动连同用户会话前对 AGENTS.md 的未提交修改一起回滚**
- 17:25 | B5 | 恢复：AGENTS.md 依会话上下文中留存的修改版全文重建（用户原改动 + 本次回写）；14 个 server 文件改动依上下文逐锚点重建（带断言的补丁脚本，锚点不匹配即失败）；`regression_baseline.json` 重新生成
- 17:40 | B5 | 复验：ruff `app/`+`scripts/drift_scan.py` All checks passed；AST 四门禁 OK；定向测试 108 passed；**全量 pytest 1665 passed + 8 skipped（178s）**；mock eval 36/36 + 0 regressions
- 教训：批量 --fix 必须限定文件清单；管道+临时文件的回滚操作先 `cat` 清单人工过目再执行

## 验收

- 17:50 | B5 | 隔离探针（未参与改造的子代理）冷启动验收：**Q1-Q4 全 ✅**，AGENTS.md 217 行达标；3 条 v1.1 非阻断建议（行数预算现实化 150→250、judges.py 锚点、secret-scan 定位说明）即时补入基座 → 报告见 [stage5-gates-and-template.md](stage5-gates-and-template.md)
- 18:10 | ALL | 终态复验：ruff clean + AST×2 OK + mock eval 0 regressions + 定向测试 44 passed；汇总落地 [final-summary.md](final-summary.md)（DoD 对照 / 改动总账 / 验证总账 / 红线遵守 / 遗留清单 8 项）

## 遗留项处理批次（2026-09-05 续）

- 18:30 | F1/2 | 迁移 `0029_llm_trace_user_book_ids.py`（user_id/book_id 列 + user/created 索引）；模型补声明 user_id/book_id/**http_request_id**（0018 加列后模型从未声明——双重断链一并修复）；`_build_trace_dict`/`_log_call`/`_log_cache_hit` 持久化三列；`http_request_id` 从 request_log 中间件的 structlog contextvar 派生（`_current_http_request_id()`）；`params`（temperature/max_tokens）经 `_record_success/_record_failure/_invoke_and_record_fallback` 线程化，**仅进 JSONL**（无 DB 列，免迁移）
- 18:40 | F1 | 修复自查发现的真 bug：trace dict 新增 user_id/book_id 后与 `logger.info` 显式 kwargs 重复 → TypeError（测试先行抓出，`_log_call`/`_log_cache_hit` 两处修复）
- 18:45 | F3 | `_TraceWriter._maybe_prune()`：`LLM_LOG_RETENTION_DAYS` 首次有消费方——flush loop 内每 6h 检查（启动即首跑），retention<=0 永久保留；session 可注入保测试密闭
- 18:50 | F5 | main.py 启动时 `llm_log_enabled=false` 打 warning（指明指标端点会空）
- 19:00 | F7 | `tests/test_stream_registry.py` 18 项：本地注册/复用/幂等释放/取消 + cross-worker 五种 reason（local/cross_worker/unknown_worker×2/not_found/redis_error）+ pub/sub 监听 fan-out + 心跳键 + owner 键 TTL=300；`tests/test_stream_pump_cancel.py` 2 项：取消事件中断 vendor 消费（pulled<total + cancelled_inside_astream 标记）、无取消全量消费
- 19:10 | F8 | 删除 `ecosystem.config.cjs`；CLAUDE.md 四处 PM2 引用改为 compose 表述（含"勿再引入 PM2"备忘）；`docs/REBUILD_PLAN.md`/`api-structure-summary.md` 为历史档案保留不动
- 19:20 | F-验证 | ruff clean（app/ + drift_scan + 新测试）；AST×2 OK；迁移离线 SQL 双向渲染正确（ADD COLUMN ×2 + CREATE INDEX / DROP 反向）；`test_alembic_chain` head 钉 0028→0029（设计内的显式动作）；**全量 pytest 1690+9 passed**；mock eval 0 regressions
