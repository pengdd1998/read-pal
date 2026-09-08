# 线上 badcase 归因 runbook（四因定位 → golden 回灌）

> 适用：用户 👎 反馈 / 监控告警 / 人工抽检发现的坏例。
> 纪律：先重建链路再归因，跳步归因无效；禁止无证据归因。

## 第一步：重建链路（10 分钟目标）

按时间序收集该 request 的全部证据：

1. **定位 request**：
   - 对话类：`ai_feedback`（👎）→ `message_id` → `chat_messages` 拿到完整输入输出；
   - 非对话类：`llm_call_traces` 按 `user_id + created_at`（迁移 0029 起可按用户查）
     或 `label + created_at` 缩窄（`GET /api/v1/stats/llm` 的 `by_label` 先看哪个
     label），JSONL 通道若开了内容捕获则直接有 prompt/output 预览；
2. **登记每个 span**：用户输入 → 检索（RAG query + 召回片段，`book_chunks`/RAG 缓存键）
   → LLM 调用（prompt_version + model + error_type + latency）→ 输出过滤（PII/有害）
   → 最终回复；
3. 输出「链路回放表」：span | 内容摘要 | 证据（表/文件:行）。

## 第二步：四因归因（判给哪个必须写明依据 span）

| 因 | 判据 |
|---|---|
| **[prompt]** | 指令歧义/互相冲突/缺输出约束/角色漂移——prompt 文本与该步输出对照可指认 |
| **[检索]** | 上下文缺料或取错料——该有的信息不在召回片段里（RAG 层问题，非模型问题） |
| **[工具]** | 误调/漏调/参数错/超时/返回误判成功（本项目主要是 fallback 链与 JSON 修复路径） |
| **[模型]** | 同 prompt 同输入多次回放输出质量不稳定，或属已知模型能力边界（长上下文遗忘、格式遵循差） |

规则：
- 证据指向多处 → 标 **[多因]** 列全并按影响排序，禁止自行挑一个顶罪；
- 修复需改产品逻辑 → 升级人工，只登记不裁决；
- 同 prompt 同输入重放 2-3 次可判稳定性（用 `python -m app.eval.eval_runner --live
  --label-filter=<label>`，注意 token 上限）。

## 第三步：回灌 golden set（评测集是活资产）

1. badcase 脱敏后写成条目：`app/eval/golden_*.py` 新增 dict
   （`service`/`action`/`input`/`expected_output`/`guards`）；
2. 判分标准**机判优先**：L0 schema 断言 > L1 contains/not_contains/equals/regex >
   实在写不出才用 L2 语义判（`app/eval/judges.py`）；
3. `guards` 必填该条防的回归类型（format/schema/injection/sanitizer/budget）；
4. 标注 case 来源（反馈日期 / 用户反馈原文摘要）；
5. `uv run python -m app.eval.eval_runner` 全绿 + `--update-baseline
   --baseline-note "backfill case <编号>"` 刷新基线；
6. 修复路由：prompt 资产（`app/prompts/`，bump version）/ 检索配置 / 网关代码 /
   模型路由（`LLM_PROVIDERS`）；
7. **验收判据：该条评测转绿即修复完成。** 修复 PR 必须让该条通过。

## 长期纪律

- 只增不减必然腐化：连续 3 个月零命中的条目按下架流程移除并在 PR 说明；
- 改 prompt/换模型/调参数 = 一律触发评测对比，报告贴 PR，"就改了一句"也不例外。
