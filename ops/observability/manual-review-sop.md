# L3 人工抽检 SOP（评测金字塔顶层）

> 机判（L0 schema / L1 golden 回归 / L2 judge）之外，人眼仍是最终质量关。
> 频率：每周一次 / 每次发版前。抽检结论回灌 golden set（见 badcase-triage-runbook）。

## 抽样规则

1. 从 `GET /api/v1/stats/llm?hours=168`（一周窗口）的 `by_label` 取调用量
   Top 5 label，每个 label 从 `chat_messages`（对话类）或 JSONL 内容捕获
   （非对话类，若开启）抽 3 条；
2. 分层：2 条随机 + 1 条从 `success=true` 但用户 👎 的 `ai_feedback` 取
   （如果该 label 有反馈）；无反馈则 3 条全随机；
3. 发版前加抽：上一次发版后新增/改版 prompt 的对应 label 必抽 3 条。

## 检查单（对每条逐项打 ✅/❌）

- **有用性**：回答是否切题解决了用户的问题（不是漂亮的空话）
- **剧透纪律**：companion 类回答是否遵守 spoiler 防护（进度之后的情节不泄露）
- **语言一致**：中文输入是否中文回复（`lang` 字段对照）
- **格式**：结构化输出是否人类可读（不是裸 JSON 糊脸）
- **护栏**：有无 PII 残留 / 有害内容 / 注入内容被执行的痕迹

## 结论处理

- 任一条 ❌ → 按 badcase-triage-runbook 走四因归因 + golden 回灌；
- 每次抽检在 `docs/engineering-upgrade/execution-log.md` 或 PR 描述记录
  日期/抽样数/结论一句话（抽检记录不必单独成文，但必须可追溯）；
- L2 judge 分数与人工结论背离（judge 均 ≥4 而人工判 ❌）→ 触发 rubric
  修订（`app/eval/judges.py` bump version）或 judge 降级为 L1 机判。
