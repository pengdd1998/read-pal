# 阶段 5（B5）：门禁固化与模板沉淀

## CI 分层定型（改造后全景）

| 时机 | 门禁 | 载体 |
|---|---|---|
| 每次 PR（阻断） | lint + AST×4 + SQLite/PG pytest + alembic 升降级 + vitest + typecheck | `ci.yml` |
| 每次 PR（阻断，路径触发） | prompt rendering + mock eval（**含基线 REGRESSION 门禁**）+ AST no-raw-book-fields | `prompt-eval.yml` |
| 每次 PR（阻断，新增） | gitleaks 规则型密钥扫描 | `secret-scan.yml`（新） |
| merge 后 / 定时 | live eval（secret 存在时）+ drift-scan 周检（mock 新鲜度 / 模板一致性 / **live 基线 diff**） | `drift-scan.yml` |
| 发布 | CI gate 等待 + 迁移前置 + 健康检查回滚 | `deploy.yml` |

## 改动清单

| 项 | 文件 | 说明 |
|---|---|---|
| drift-scan live 接线 | `scripts/drift_scan.py` | 修复 docstring 声称但未实现的基线比对；REGRESSION 开 issue 的信号质量升级 |
| pytest 配置合并 | `pytest.ini` + `pyproject.toml`（从属同步） | 唯一事实源；修掉被遮蔽的 addopts/smoke marker（ADR-0003） |
| ADR | `docs/adr/0001-0003` | 观测栈选型 / 评测分层与基线门禁 / pytest 合并 |
| 脚手架模板 | `templates/agent-service/README.md` | 目录契约 + 必装门禁件清单（含复制源）+ 四条红线 |
| 基座回写 | `AGENTS.md` ×4 处 + v1.1 探针微调 ×3 | prompt 流程（pin/基线刷新）、观测架构图、badcase 章节、secret-scan 行、行数预算 150→250 现实化、judges.py 锚点 |
| CHANGELOG | `CHANGELOG.md` | [Unreleased] 工程化改造全量条目（此前停更于 2026-04-19） |

## 隔离探针报告（验收核心——由未参与改造的子代理冷启动执行）

探针约束：只读基座文件（AGENTS.md / .env.example / prompts/base.py / eval 模块 /
ops 手册 / 模板 / 4 个 workflow），禁止读改造过程文档与 git 历史。

| 问题 | 判定 | 溯源要点 |
|---|---|---|
| Q1 prompt 变更流程（目录/版本/i18n pin/评测触发/基线刷新） | ✅ | AGENTS.md:99-114 五步 + base.py:39 校验 + prompt-eval.yml 触发 |
| Q2 LLM 调用规范（唯一出口/必传参数/日志字段/JSONL/内容捕获纪律） | ✅ | AGENTS.md:116-123 + templates README + llm-metrics.md |
| Q3 评测（命令/golden 位置/guards 词表/equals·regex/CI 分层/REGRESSION 阻断/update 许可） | ✅ | eval_runner.py:208-236 + golden_dataset.py:70-110 + assertions.py:58-67 |
| Q4 badcase 全流程（指标端点/链路重建/四因归因/回灌格式/验收判据） | ✅ | AGENTS.md badcase 小节 + badcase-triage-runbook.md |
| AGENTS.md 行数 | 217 行 ≤300 达标（自标 150 过时 → v1.1 已改 250 并记录下沉候选） | |

**结论：4/4 ✅，基座自足，无 ❌ 断链。** 三条 v1.1 非阻断建议（行数预算现实化、
judges.py 锚点、secret-scan 定位说明）已在探针后即时补入基座。

## 工程化探针 ❌ 清零判定

按工作流门禁「❌ 清零才发布脚手架」：探针零 ❌ → `templates/agent-service/`
具备发布条件。共享资产抽取（网关/judge rubric/CI 模板跨项目公共包）按工作流
要求"评估"：当前单项目仓库，抽取收益为负，登记为多项目并存时再启（见
final-summary 遗留清单）。
